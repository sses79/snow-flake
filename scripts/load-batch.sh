#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and configure the named Snowflake connection." >&2
  exit 1
fi
set -a
source .env
set +a

: "${SNOWFLAKE_CONNECTION_NAME:?Set SNOWFLAKE_CONNECTION_NAME in .env}"

manifest_path="${1:-generated-data/milestone-1/batch_m1_c17d965e5b1c.manifest.json}"
if [[ ! -f "$manifest_path" ]]; then
  echo "Missing generated batch manifest at ${manifest_path}; run make generate first." >&2
  exit 1
fi

manifest_absolute_path="$(cd "$(dirname "$manifest_path")" && pwd)/$(basename "$manifest_path")"
data_file=$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.data_file)' "$manifest_absolute_path")
batch_id=$(node -e 'const m=require(process.argv[1]); process.stdout.write(m.batch_id)' "$manifest_absolute_path")
manifest_count=$(node -e 'const m=require(process.argv[1]); process.stdout.write(String(m.row_count))' "$manifest_absolute_path")
data_path="$(dirname "$manifest_absolute_path")/${data_file}"
load_run_id="${batch_id}_$(date -u +%Y%m%dT%H%M%SZ)_$$"

if [[ ! "$manifest_count" =~ ^[0-9]+$ ]] ||
   [[ ! "$batch_id" =~ ^[a-zA-Z0-9_-]+$ ]] ||
   [[ ! "$data_file" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
  echo "Generated manifest contains invalid values." >&2
  exit 1
fi
if [[ ! -f "$data_path" ]]; then
  echo "Missing generated data file at ${data_path}." >&2
  exit 1
fi

audit_started=false
record_failed_run() {
  exit_code=$?
  trap - ERR
  if [[ "$audit_started" == "true" ]]; then
    snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -q \
      "USE ROLE WELLBEING_DEMO_LOADER;
       USE WAREHOUSE WELLBEING_DEMO_LOAD_WH;
       ALTER SESSION SET QUERY_TAG = 'wellbeing_demo_load_audit';
       UPDATE SCHOOL_WELLBEING_DEMO.GOVERNANCE.PIPELINE_RUNS
       SET STATUS = 'FAILED',
           COMPLETED_AT = CURRENT_TIMESTAMP(),
           EXIT_CODE = ${exit_code}
       WHERE RUN_ID = '${load_run_id}';" >/dev/null 2>&1 || true
  fi
  exit "$exit_code"
}
trap record_failed_run ERR

snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -q \
  "USE ROLE WELLBEING_DEMO_LOADER;
   USE WAREHOUSE WELLBEING_DEMO_LOAD_WH;
   ALTER SESSION SET QUERY_TAG = 'wellbeing_demo_load_audit';
   INSERT INTO SCHOOL_WELLBEING_DEMO.GOVERNANCE.PIPELINE_RUNS
     (RUN_ID, BATCH_ID, SOURCE_FILE, STATUS, EXPECTED_ROW_COUNT)
   VALUES
     ('${load_run_id}', '${batch_id}', '${data_file}', 'RUNNING', ${manifest_count});"
audit_started=true

snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -q \
  "USE ROLE WELLBEING_DEMO_LOADER;
   USE WAREHOUSE WELLBEING_DEMO_LOAD_WH;
   ALTER SESSION SET QUERY_TAG = 'wellbeing_demo_load';
   PUT 'file://${data_path}'
     @SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_INTERNAL_STAGE
     AUTO_COMPRESS=FALSE
     OVERWRITE=FALSE;
   COPY INTO SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS
     (ENVELOPE, SOURCE_FILE, SOURCE_FILE_ROW_NUMBER, LOADED_AT, LOAD_RUN_ID)
   FROM (
     SELECT \$1, METADATA\$FILENAME, METADATA\$FILE_ROW_NUMBER, CURRENT_TIMESTAMP(), '${load_run_id}'
     FROM @SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_INTERNAL_STAGE/${data_file}
   )
   FILE_FORMAT = (FORMAT_NAME = SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_NDJSON_FORMAT)
   ON_ERROR = ABORT_STATEMENT;
   EXECUTE IMMEDIATE \$\$
   DECLARE actual_count NUMBER;
           reconciliation_failed EXCEPTION (-20001, 'Manifest/raw reconciliation failed');
   BEGIN
     SELECT COUNT(*) INTO :actual_count
     FROM SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS
     WHERE ENVELOPE:batch_id::STRING = '${batch_id}';
     IF (actual_count != ${manifest_count}) THEN
       RAISE reconciliation_failed;
     END IF;
     RETURN 'Manifest/raw reconciliation passed: ' || actual_count || ' rows';
   END;
   \$\$;"

snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -q \
  "USE ROLE WELLBEING_DEMO_LOADER;
   USE WAREHOUSE WELLBEING_DEMO_LOAD_WH;
   ALTER SESSION SET QUERY_TAG = 'wellbeing_demo_load_audit';
   UPDATE SCHOOL_WELLBEING_DEMO.GOVERNANCE.PIPELINE_RUNS
   SET STATUS = 'SUCCEEDED',
       OBSERVED_BATCH_ROW_COUNT = (
         SELECT COUNT(*)
         FROM SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS
         WHERE ENVELOPE:batch_id::STRING = '${batch_id}'
       ),
       COMPLETED_AT = CURRENT_TIMESTAMP(),
       EXIT_CODE = 0
   WHERE RUN_ID = '${load_run_id}';"

trap - ERR
