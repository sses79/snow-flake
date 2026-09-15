-- Run as WELLBEING_DEMO_OBSERVER. This surface contains operational
-- aggregates and filenames only; it exposes no survey response rows.
select
    observed_at,
    operational_status,
    last_successful_load_at,
    last_failed_load_at,
    last_failed_file,
    failed_load_count_7d,
    failed_query_count_24h,
    total_credits_24h,
    total_credits_30d,
    approximate_cost_30d,
    configured_cost_currency,
    account_usage_latency_note
from school_wellbeing_demo.marts.mart_pipeline_health_secure;
