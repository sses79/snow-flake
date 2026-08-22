-- Milestone 0: raw ingestion objects.
-- Prerequisites:
--   1. infra/snowflake/00_roles.sql
--   2. infra/snowflake/01_foundation.sql

USE ROLE WELLBEING_DEMO_ADMIN;
USE DATABASE SCHOOL_WELLBEING_DEMO;
USE SCHEMA RAW;

-- The adapter emits one complete JSON change envelope per line. It does not
-- wrap a batch in a JSON array, so STRIP_OUTER_ARRAY must remain FALSE.
CREATE FILE FORMAT IF NOT EXISTS WELLBEING_NDJSON_FORMAT
  TYPE = JSON
  COMPRESSION = AUTO
  STRIP_OUTER_ARRAY = FALSE
  ALLOW_DUPLICATE = FALSE
  COMMENT = 'One wellbeing submission change envelope per line';

-- Local-first landing area. Milestone 5 can replace this ingestion adapter
-- with an external S3 stage while keeping the same raw table contract.
CREATE STAGE IF NOT EXISTS WELLBEING_INTERNAL_STAGE
  FILE_FORMAT = WELLBEING_NDJSON_FORMAT
  COMMENT = 'Immutable local-first wellbeing submission batches';

-- Raw is append-only. Deduplication, latest-version selection, and withdrawal
-- handling belong in dbt models, never in this source-history table.
CREATE TABLE IF NOT EXISTS MONGO_WELLBEING_SUBMISSIONS (
  ENVELOPE VARIANT NOT NULL,
  SOURCE_FILE STRING NOT NULL,
  SOURCE_FILE_ROW_NUMBER NUMBER NOT NULL,
  LOADED_AT TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
  LOAD_RUN_ID STRING
)
COMMENT = 'Append-only Mongo-shaped wellbeing submission changes';

-- Verification output; these metadata commands do not need a running
-- warehouse and therefore do not consume warehouse compute credits.
DESCRIBE FILE FORMAT WELLBEING_NDJSON_FORMAT;
DESCRIBE STAGE WELLBEING_INTERNAL_STAGE;
DESCRIBE TABLE MONGO_WELLBEING_SUBMISSIONS;
LIST @WELLBEING_INTERNAL_STAGE;
SHOW TABLES LIKE 'MONGO_WELLBEING_SUBMISSIONS' IN SCHEMA RAW;
