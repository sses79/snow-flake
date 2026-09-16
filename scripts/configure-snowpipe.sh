#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and configure Snowflake." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${SNOWFLAKE_CONNECTION_NAME:?Set SNOWFLAKE_CONNECTION_NAME in .env}"
admin_connection="${SNOWFLAKE_ADMIN_CONNECTION_NAME:-${SNOWFLAKE_CONNECTION_NAME}}"
terraform_dir="infra/aws"

if [[ ! -d "${terraform_dir}/.terraform" ]]; then
  echo "Terraform is not initialized. Run: terraform -chdir=infra/aws init" >&2
  exit 1
fi

aws_role_arn="$(terraform -chdir="${terraform_dir}" output -raw snowflake_storage_role_arn)"
s3_bucket="$(terraform -chdir="${terraform_dir}" output -raw landing_bucket_name)"

if [[ ! "${aws_role_arn}" =~ ^arn:[^:]+:iam::[0-9]{12}:role/[A-Za-z0-9+=,.@_/-]+$ ]]; then
  echo "Terraform returned an invalid Snowflake storage role ARN." >&2
  exit 1
fi
if [[ ! "${s3_bucket}" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  echo "Terraform returned an invalid S3 bucket name." >&2
  exit 1
fi

# Phase 1: create the integration. Snowflake can now reveal the exact IAM
# principal and external ID, but the external stage cannot be validated yet.
snow sql -c "${admin_connection}" \
  --local-only \
  --silent \
  -f infra/snowflake/08_storage_integration.sql \
  -D "aws_role_arn=${aws_role_arn}" \
  -D "s3_bucket=${s3_bucket}" >/dev/null

handshake_json="$(snow sql -c "${admin_connection}" --format JSON --silent -q \
  "DESC INTEGRATION WELLBEING_DEMO_S3_INTEGRATION;
   SELECT
     MAX(IFF(\"property\" = 'STORAGE_AWS_IAM_USER_ARN', \"property_value\", NULL)) AS IAM_USER_ARN,
     MAX(IFF(\"property\" = 'STORAGE_AWS_EXTERNAL_ID', \"property_value\", NULL)) AS EXTERNAL_ID
   FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));")"

HANDSHAKE_JSON="${handshake_json}" node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const values = JSON.parse(process.env.HANDSHAKE_JSON).flat(Infinity);
  const row = values.find((value) => value && typeof value === "object" && value.IAM_USER_ARN);
  if (!row || !/^arn:[^:]+:iam::[0-9]{12}:(user|role)\//.test(row.IAM_USER_ARN) || !row.EXTERNAL_ID) {
    throw new Error("Could not extract the Snowflake storage integration handshake");
  }
  const path = "infra/aws/terraform.auto.tfvars.json";
  let existing = {};
  try { existing = JSON.parse(readFileSync(path, "utf8")); } catch {}
  writeFileSync(path, `${JSON.stringify({
    ...existing,
    snowflake_iam_user_arn: row.IAM_USER_ARN,
    snowflake_external_id: row.EXTERNAL_ID
  }, null, 2)}\n`, { mode: 0o600 });
'
unset handshake_json

# Phase 2: install the exact trust policy, then create the stage and pipe.
terraform -chdir="${terraform_dir}" apply -auto-approve >/dev/null

stage_configured=false
for attempt in $(seq 1 12); do
  if snow sql -c "${admin_connection}" \
    --local-only \
    --silent \
    -f infra/snowflake/09_snowpipe.sql \
    -D "s3_bucket=${s3_bucket}" >/dev/null 2>&1; then
    stage_configured=true
    break
  fi
  sleep 5
done
if [[ "${stage_configured}" != "true" ]]; then
  echo "Snowflake could not assume the AWS role after waiting for IAM propagation." >&2
  exit 1
fi

queue_json="$(snow sql -c "${admin_connection}" --format JSON --silent -q \
  "SHOW PIPES LIKE 'WELLBEING_SUBMISSIONS_PIPE' IN SCHEMA SCHOOL_WELLBEING_DEMO.RAW;
   SELECT \"notification_channel\" AS QUEUE_ARN
   FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));")"

QUEUE_JSON="${queue_json}" node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  const values = JSON.parse(process.env.QUEUE_JSON).flat(Infinity);
  const row = values.find((value) => value && typeof value === "object" && value.QUEUE_ARN);
  if (!row || !/^arn:[^:]+:sqs:[^:]+:[0-9]{12}:[A-Za-z0-9_-]+$/.test(row.QUEUE_ARN)) {
    throw new Error("Could not extract the Snowflake-managed SQS queue ARN");
  }
  const path = "infra/aws/terraform.auto.tfvars.json";
  const existing = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, `${JSON.stringify({
    ...existing,
    snowpipe_notification_queue_arn: row.QUEUE_ARN
  }, null, 2)}\n`, { mode: 0o600 });
'
unset queue_json

# Phase 3: point S3 ObjectCreated events at Snowflake's managed queue.
terraform -chdir="${terraform_dir}" apply -auto-approve >/dev/null

echo "Snowflake integration, AWS trust, external stage, pipe, and S3 notification are configured."
