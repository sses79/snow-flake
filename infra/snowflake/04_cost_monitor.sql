-- Milestone 0: shared warehouse credit guardrail.
--
-- Required Snowflake CLI template variable:
--   -D "credit_quota=<positive number>"
--
-- Example only (choose a quota appropriate to your account):
--   snow sql ... -f infra/snowflake/04_cost_monitor.sql -D "credit_quota=5"

USE ROLE ACCOUNTADMIN;

-- CREATE IF NOT EXISTS preserves accumulated usage on reruns. The quota is
-- updated separately below so a deliberate new -D value takes effect without
-- replacing the monitor.
CREATE RESOURCE MONITOR IF NOT EXISTS WELLBEING_DEMO_MONITOR
  WITH CREDIT_QUOTA = <% credit_quota %>
  FREQUENCY = MONTHLY
  START_TIMESTAMP = IMMEDIATELY
  TRIGGERS
    ON 50 PERCENT DO NOTIFY
    ON 80 PERCENT DO NOTIFY
    ON 90 PERCENT DO SUSPEND
    ON 100 PERCENT DO SUSPEND_IMMEDIATE;

ALTER RESOURCE MONITOR IF EXISTS WELLBEING_DEMO_MONITOR
  SET CREDIT_QUOTA = <% credit_quota %>;

-- A single monitor bounds total standard-warehouse consumption for this demo.
-- Usage by any one warehouse contributes to the same shared quota.
ALTER WAREHOUSE WELLBEING_DEMO_LOAD_WH
  SET RESOURCE_MONITOR = WELLBEING_DEMO_MONITOR;

ALTER WAREHOUSE WELLBEING_DEMO_TRANSFORM_WH
  SET RESOURCE_MONITOR = WELLBEING_DEMO_MONITOR;

ALTER WAREHOUSE WELLBEING_DEMO_APP_WH
  SET RESOURCE_MONITOR = WELLBEING_DEMO_MONITOR;

-- Verification output.
SHOW RESOURCE MONITORS LIKE 'WELLBEING_DEMO_MONITOR';
SHOW WAREHOUSES LIKE 'WELLBEING_DEMO_%';
