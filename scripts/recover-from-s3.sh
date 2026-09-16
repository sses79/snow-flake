#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${repository_root}"

if [[ "${1:-}" != "--confirm-truncate-raw" ]]; then
  echo "This exercise truncates only SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS." >&2
  echo "Re-run with --confirm-truncate-raw after confirming the S3 landing contains every manifest." >&2
  exit 1
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
admin_connection="${SNOWFLAKE_ADMIN_CONNECTION_NAME:-${SNOWFLAKE_CONNECTION_NAME}}"

resume_pipe() {
  snow sql -c "${admin_connection}" -q \
    "USE ROLE WELLBEING_DEMO_ADMIN;
     ALTER PIPE IF EXISTS SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_SUBMISSIONS_PIPE
       SET PIPE_EXECUTION_PAUSED = FALSE;" >/dev/null 2>&1 || true
}
trap resume_pipe EXIT

snow sql -c "${admin_connection}" -q \
  "USE ROLE WELLBEING_DEMO_ADMIN;
   USE WAREHOUSE WELLBEING_DEMO_LOAD_WH;
   ALTER PIPE SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_SUBMISSIONS_PIPE
     SET PIPE_EXECUTION_PAUSED = TRUE;
   TRUNCATE TABLE SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS;
   COPY INTO SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS
     (ENVELOPE, SOURCE_FILE, SOURCE_FILE_ROW_NUMBER, LOADED_AT, LOAD_RUN_ID)
   FROM (
     SELECT
       \$1,
       METADATA\$FILENAME,
       METADATA\$FILE_ROW_NUMBER,
       METADATA\$START_SCAN_TIME,
       CONCAT('s3-recovery:', METADATA\$FILENAME)
     FROM @SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_S3_STAGE
   )
   PATTERN = '.*[.]ndjson[.]gz'
   FILE_FORMAT = (FORMAT_NAME = SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_NDJSON_FORMAT)
   ON_ERROR = SKIP_FILE
   FORCE = TRUE;"

./scripts/dbt-command.sh build --full-refresh
resume_pipe
trap - EXIT

echo "Raw and downstream dbt relations were rebuilt from versioned S3 landing files."
