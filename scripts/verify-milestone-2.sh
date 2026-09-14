#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and configure Snowflake." >&2
  exit 1
fi
set -a
source .env
set +a

: "${SNOWFLAKE_CONNECTION_NAME:?Set SNOWFLAKE_CONNECTION_NAME in .env}"

dbt_command=(
  .venv/bin/dbt
  build
  --project-dir dbt
  --profiles-dir dbt
)
fact_snapshot="SCHOOL_WELLBEING_DEMO.CORE.FCT_WELLBEING_RESPONSE_M2_INCREMENTAL_SNAPSHOT"
mart_snapshot="SCHOOL_WELLBEING_DEMO.MARTS.MART_SCHOOL_WELLBEING_TREND_M2_INCREMENTAL_SNAPSHOT"

cleanup() {
  snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -q \
    "USE ROLE WELLBEING_DEMO_TRANSFORMER;
     DROP TABLE IF EXISTS ${fact_snapshot};
     DROP TABLE IF EXISTS ${mart_snapshot};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

node apps/generator/src/cli.ts >/dev/null
./scripts/load-batch.sh
./scripts/load-milestone-2.sh
"${dbt_command[@]}"

snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -q \
  "USE ROLE WELLBEING_DEMO_TRANSFORMER;
   DROP TABLE IF EXISTS ${fact_snapshot};
   DROP TABLE IF EXISTS ${mart_snapshot};
   CREATE TRANSIENT TABLE ${fact_snapshot}
     CLONE SCHOOL_WELLBEING_DEMO.CORE.FCT_WELLBEING_RESPONSE;
   CREATE TRANSIENT TABLE ${mart_snapshot}
     CLONE SCHOOL_WELLBEING_DEMO.MARTS.MART_SCHOOL_WELLBEING_TREND;"

"${dbt_command[@]}" --full-refresh

snow sql -c "$SNOWFLAKE_CONNECTION_NAME" -q \
  "USE ROLE WELLBEING_DEMO_TRANSFORMER;
   USE WAREHOUSE WELLBEING_DEMO_TRANSFORM_WH;
   EXECUTE IMMEDIATE \$\$
   DECLARE difference_count NUMBER;
           equivalence_failed EXCEPTION (-20002, 'Incremental/full-refresh equivalence failed');
   BEGIN
     SELECT COUNT(*) INTO :difference_count
     FROM (
       (SELECT * FROM ${fact_snapshot}
        MINUS
        SELECT * FROM SCHOOL_WELLBEING_DEMO.CORE.FCT_WELLBEING_RESPONSE)
       UNION ALL
       (SELECT * FROM SCHOOL_WELLBEING_DEMO.CORE.FCT_WELLBEING_RESPONSE
        MINUS
        SELECT * FROM ${fact_snapshot})
     );
     IF (difference_count != 0) THEN
       RAISE equivalence_failed;
     END IF;

     SELECT COUNT(*) INTO :difference_count
     FROM (
       (SELECT * FROM ${mart_snapshot}
        MINUS
        SELECT * FROM SCHOOL_WELLBEING_DEMO.MARTS.MART_SCHOOL_WELLBEING_TREND)
       UNION ALL
       (SELECT * FROM SCHOOL_WELLBEING_DEMO.MARTS.MART_SCHOOL_WELLBEING_TREND
        MINUS
        SELECT * FROM ${mart_snapshot})
     );
     IF (difference_count != 0) THEN
       RAISE equivalence_failed;
     END IF;
     RETURN 'Incremental/full-refresh equivalence passed';
   END;
   \$\$;"

snow sql -c "$SNOWFLAKE_CONNECTION_NAME" \
  -f infra/snowflake/05_tenant_reader_views.sql
