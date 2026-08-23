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

manifest_path="generated-data/milestone-1/batch_m1_c17d965e5b1c.manifest.json"
if [[ ! -f "$manifest_path" ]]; then
  echo "Missing generated batch manifest; run make generate first." >&2
  exit 1
fi

data_file=$(node -e 'const m=require("./'"$manifest_path"'"); process.stdout.write(m.data_file)')
batch_id=$(node -e 'const m=require("./'"$manifest_path"'"); process.stdout.write(m.batch_id)')
manifest_count=$(node -e 'const m=require("./'"$manifest_path"'"); process.stdout.write(String(m.row_count))')
data_path="$(pwd)/generated-data/milestone-1/${data_file}"

if [[ ! "$manifest_count" =~ ^[0-9]+$ ]] || [[ ! "$batch_id" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "Generated manifest contains invalid values." >&2
  exit 1
fi

snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -q \
  "USE ROLE WELLBEING_DEMO_LOADER; USE WAREHOUSE WELLBEING_DEMO_LOAD_WH; PUT 'file://${data_path}' @SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_INTERNAL_STAGE AUTO_COMPRESS=FALSE OVERWRITE=FALSE;"

snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -q \
  "USE ROLE WELLBEING_DEMO_LOADER;
   USE WAREHOUSE WELLBEING_DEMO_LOAD_WH;
   COPY INTO SCHOOL_WELLBEING_DEMO.RAW.MONGO_WELLBEING_SUBMISSIONS
     (ENVELOPE, SOURCE_FILE, SOURCE_FILE_ROW_NUMBER, LOADED_AT, LOAD_RUN_ID)
   FROM (
     SELECT \$1, METADATA\$FILENAME, METADATA\$FILE_ROW_NUMBER, CURRENT_TIMESTAMP(), '${batch_id}'
     FROM @SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_INTERNAL_STAGE/${data_file}
   )
   FILE_FORMAT = (FORMAT_NAME = SCHOOL_WELLBEING_DEMO.RAW.WELLBEING_NDJSON_FORMAT)
   ON_ERROR = ABORT_STATEMENT;"

snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -q \
  "USE ROLE WELLBEING_DEMO_LOADER;
   USE WAREHOUSE WELLBEING_DEMO_LOAD_WH;
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
