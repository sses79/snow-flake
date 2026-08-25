-- Tenant-isolated reader views for Power BI and other dashboard clients.
-- Prerequisites:
--   1. infra/snowflake/00_roles.sql through 03_grants.sql
--   2. dbt has built MARTS.MART_SCHOOL_WELLBEING_TREND

USE ROLE WELLBEING_DEMO_ADMIN;

-- Remove the legacy blanket grants before creating either tenant view. If
-- retained, both reader roles would automatically receive every new view.
REVOKE SELECT ON FUTURE VIEWS IN SCHEMA SCHOOL_WELLBEING_DEMO.MARTS
  FROM ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
REVOKE SELECT ON FUTURE VIEWS IN SCHEMA SCHOOL_WELLBEING_DEMO.MARTS
  FROM ROLE WELLBEING_DEMO_TRUST_SOUTH_READER;

REVOKE SELECT ON ALL VIEWS IN SCHEMA SCHOOL_WELLBEING_DEMO.MARTS
  FROM ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
REVOKE SELECT ON ALL VIEWS IN SCHEMA SCHOOL_WELLBEING_DEMO.MARTS
  FROM ROLE WELLBEING_DEMO_TRUST_SOUTH_READER;

CREATE OR REPLACE SECURE VIEW
  SCHOOL_WELLBEING_DEMO.MARTS.MART_TRUST_NORTH_SCHOOL_WELLBEING_TREND
  COMMENT = 'North-trust-only Power BI semantic view over the wellbeing trend mart'
AS
SELECT
    trust_id,
    school_id,
    school_classification,
    survey_period,
    question_code,
    eligible_submission_count,
    answered_response_count,
    missing_response_count,
    adverse_response_count,
    adverse_response_rate
FROM SCHOOL_WELLBEING_DEMO.MARTS.MART_SCHOOL_WELLBEING_TREND
WHERE trust_id = 'trust_north';

CREATE OR REPLACE SECURE VIEW
  SCHOOL_WELLBEING_DEMO.MARTS.MART_TRUST_SOUTH_SCHOOL_WELLBEING_TREND
  COMMENT = 'South-trust-only Power BI semantic view over the wellbeing trend mart'
AS
SELECT
    trust_id,
    school_id,
    school_classification,
    survey_period,
    question_code,
    eligible_submission_count,
    answered_response_count,
    missing_response_count,
    adverse_response_count,
    adverse_response_rate
FROM SCHOOL_WELLBEING_DEMO.MARTS.MART_SCHOOL_WELLBEING_TREND
WHERE trust_id = 'trust_south';

GRANT SELECT ON VIEW
  SCHOOL_WELLBEING_DEMO.MARTS.MART_TRUST_NORTH_SCHOOL_WELLBEING_TREND
  TO ROLE WELLBEING_DEMO_TRUST_NORTH_READER;

GRANT SELECT ON VIEW
  SCHOOL_WELLBEING_DEMO.MARTS.MART_TRUST_SOUTH_SCHOOL_WELLBEING_TREND
  TO ROLE WELLBEING_DEMO_TRUST_SOUTH_READER;

SHOW FUTURE GRANTS IN SCHEMA SCHOOL_WELLBEING_DEMO.MARTS;
SHOW GRANTS TO ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
SHOW GRANTS TO ROLE WELLBEING_DEMO_TRUST_SOUTH_READER;
