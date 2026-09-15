-- Milestone 5: least-privilege operational health surface.
-- Prerequisite: dbt has built MARTS.MART_PIPELINE_HEALTH.

USE ROLE WELLBEING_DEMO_ADMIN;

CREATE OR REPLACE SECURE VIEW
  SCHOOL_WELLBEING_DEMO.MARTS.MART_PIPELINE_HEALTH_SECURE
  COMMENT = 'Credential-free operational health summary for the observer role'
AS
SELECT
    observed_at,
    operational_status,
    last_successful_load_at,
    last_failed_load_at,
    last_failed_file,
    failed_load_count_7d,
    failed_query_count_24h,
    last_failed_query_at,
    raw_row_count,
    audited_run_count_30d,
    successful_run_count_30d,
    failed_run_count_30d,
    load_warehouse_credits_24h,
    transform_warehouse_credits_24h,
    app_warehouse_credits_24h,
    total_credits_24h,
    total_credits_30d,
    configured_credit_price,
    configured_cost_currency,
    approximate_cost_30d,
    account_usage_latency_note
FROM SCHOOL_WELLBEING_DEMO.MARTS.MART_PIPELINE_HEALTH;

GRANT SELECT ON VIEW
  SCHOOL_WELLBEING_DEMO.MARTS.MART_PIPELINE_HEALTH_SECURE
  TO ROLE WELLBEING_DEMO_OBSERVER;

SHOW GRANTS TO ROLE WELLBEING_DEMO_OBSERVER;
