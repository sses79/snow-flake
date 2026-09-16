#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

npm test
node apps/generator/src/cli.ts >/dev/null
terraform -chdir=infra/aws fmt -check
if [[ ! -d infra/aws/.terraform ]]; then
  terraform -chdir=infra/aws init -backend=false
fi
terraform -chdir=infra/aws validate
./scripts/upload-batch-s3.sh \
  generated-data/milestone-6/batch_m6_01_schema_drift.manifest.json \
  --dry-run

if [[ "${1:-}" == "--local" ]]; then
  echo "Milestone 6 local checks passed. Live AWS/Snowflake checks were skipped."
  exit 0
fi

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and configure Snowflake." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

: "${SNOWFLAKE_CONNECTION_NAME:?Set SNOWFLAKE_CONNECTION_NAME in .env}"

if [[ "$(terraform -chdir=infra/aws output -raw snowflake_trust_configured)" != "true" ]] ||
   [[ "$(terraform -chdir=infra/aws output -raw snowpipe_notification_configured)" != "true" ]]; then
  echo "Terraform has not been finalized with the Snowflake trust and SQS queue ARN." >&2
  exit 1
fi

./scripts/upload-milestone-6.sh
live_manifest="$(node apps/generator/src/live-fixture-cli.ts)"
live_batch_id="$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.batch_id)' "${live_manifest}")"
if [[ ! "${live_batch_id}" =~ ^batch_m6_live_[A-Za-z0-9]+$ ]]; then
  echo "Generated live fixture has an invalid batch ID." >&2
  exit 1
fi
./scripts/upload-batch-s3.sh "${live_manifest}"
# A second delivery to the identical immutable key must not add another load.
./scripts/upload-batch-s3.sh "${live_manifest}"

snow_assert() {
  local role="$1"
  local body="$2"
  local warehouse="WELLBEING_DEMO_LOAD_WH"
  if [[ "${role}" == "WELLBEING_DEMO_TRANSFORMER" ]]; then
    warehouse="WELLBEING_DEMO_TRANSFORM_WH"
  fi
  snow sql -c "${SNOWFLAKE_CONNECTION_NAME}" -q \
    "USE ROLE ${role};
     USE SECONDARY ROLES NONE;
     USE WAREHOUSE ${warehouse};
     USE DATABASE SCHOOL_WELLBEING_DEMO;
     USE SCHEMA RAW;
     ${body}" >/dev/null 2>&1
}

wait_for_assertion() {
  local description="$1"
  local body="$2"
  local attempt
  for attempt in $(seq 1 24); do
    if snow_assert WELLBEING_DEMO_LOADER "${body}"; then
      echo "Passed: ${description}"
      return
    fi
    sleep 5
  done
  echo "Timed out: ${description}" >&2
  snow sql -c "${SNOWFLAKE_CONNECTION_NAME}" -f infra/snowflake/10_snowpipe_acceptance.sql || true
  exit 1
}

wait_for_assertion "Snowpipe loaded the optional-schema fixture once" \
  "EXECUTE IMMEDIATE \$\$
   DECLARE observed NUMBER;
           failed EXCEPTION (-20061, 'Expected one raw Milestone 6 schema row');
   BEGIN
     SELECT COUNT(*) INTO :observed
     FROM MONGO_WELLBEING_SUBMISSIONS
     WHERE ENVELOPE:batch_id::STRING = '${live_batch_id}'
       AND ENVELOPE:producer_metadata.contract_revision::STRING = '1.1';
     IF (observed != 1) THEN RAISE failed; END IF;
     RETURN observed;
   END;
   \$\$;"

./scripts/dbt-command.sh build

snow_assert WELLBEING_DEMO_TRANSFORMER \
  "EXECUTE IMMEDIATE \$\$
   DECLARE logical_rows NUMBER;
           failed EXCEPTION (-20062, 'Replayed event changed the logical-event grain');
   BEGIN
     SELECT COUNT(*) INTO :logical_rows
     FROM SCHOOL_WELLBEING_DEMO.STAGING.STG_WELLBEING_SUBMISSION_CHANGES
     WHERE EVENT_ID = (
       SELECT ENVELOPE:event_id::STRING
       FROM MONGO_WELLBEING_SUBMISSIONS
       WHERE ENVELOPE:batch_id::STRING = '${live_batch_id}'
       LIMIT 1
     );
     IF (logical_rows != 1) THEN RAISE failed; END IF;
     RETURN logical_rows;
   END;
   \$\$;"
echo "Passed: duplicate business event remains one logical event"

# A full refresh replaces downstream dbt relations from retained raw history;
# the dbt reconciliation tests prove the rebuilt grains are equivalent.
./scripts/dbt-command.sh build --full-refresh

./scripts/upload-milestone-6.sh --include-rejected
wait_for_assertion "COPY_HISTORY exposes the intentionally rejected file" \
  "EXECUTE IMMEDIATE \$\$
   DECLARE rejected NUMBER;
           failed EXCEPTION (-20063, 'Rejected fixture is not visible in COPY_HISTORY');
   BEGIN
     SELECT COUNT(*) INTO :rejected
     FROM TABLE(INFORMATION_SCHEMA.COPY_HISTORY(
       TABLE_NAME => 'MONGO_WELLBEING_SUBMISSIONS',
       START_TIME => DATEADD('day', -14, CURRENT_TIMESTAMP()),
       PIPE_NAME => 'WELLBEING_SUBMISSIONS_PIPE'
     ))
     WHERE FILE_NAME LIKE '%batch_m6_02_rejected_file%'
       AND UPPER(REPLACE(STATUS, ' ', '_')) IN ('LOAD_FAILED', 'PARTIALLY_LOADED', 'LOAD_SKIPPED')
       AND COALESCE(ERROR_COUNT, 0) > 0;
     IF (rejected < 1) THEN RAISE failed; END IF;
     RETURN rejected;
   END;
   \$\$;"

snow sql -c "${SNOWFLAKE_CONNECTION_NAME}" -f infra/snowflake/10_snowpipe_acceptance.sql
echo "Milestone 6 acceptance passed."
