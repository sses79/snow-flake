{{ config(materialized='table') }}

with raw_state as (
    select
        count(*) as raw_row_count,
        max(loaded_at) as raw_last_loaded_at
    from {{ source('raw', 'mongo_wellbeing_submissions') }}
),

audit_summary as (
    select
        coalesce(count_if(started_at >= dateadd(day, -30, current_timestamp())), 0) as audited_run_count_30d,
        coalesce(count_if(status = 'SUCCEEDED' and started_at >= dateadd(day, -30, current_timestamp())), 0) as successful_run_count_30d,
        coalesce(count_if(status = 'FAILED' and started_at >= dateadd(day, -30, current_timestamp())), 0) as failed_run_count_30d,
        coalesce(count_if(status = 'FAILED' and started_at >= dateadd(day, -7, current_timestamp())), 0) as failed_run_count_7d,
        max(case when status = 'FAILED' then completed_at end) as last_audited_failure_at,
        max_by(case when status = 'FAILED' then source_file end,
            case when status = 'FAILED' then completed_at end) as last_audited_failed_file
    from {{ source('governance', 'pipeline_runs') }}
),

copy_summary as (
    select
        max(case when upper(replace(status, ' ', '_')) = 'LOADED' then last_load_time end) as last_copy_success_at,
        max(case when upper(replace(status, ' ', '_')) in ('LOAD_FAILED', 'PARTIALLY_LOADED')
            then last_load_time end) as last_copy_failure_at,
        max_by(case when upper(replace(status, ' ', '_')) in ('LOAD_FAILED', 'PARTIALLY_LOADED')
                then file_name end,
            case when upper(replace(status, ' ', '_')) in ('LOAD_FAILED', 'PARTIALLY_LOADED')
                then last_load_time end) as last_copy_failed_file,
        coalesce(count_if(
            upper(replace(status, ' ', '_')) in ('LOAD_FAILED', 'PARTIALLY_LOADED')
            and last_load_time >= dateadd(day, -7, current_timestamp())
        ), 0) as account_failed_load_count_7d
    from snowflake.account_usage.copy_history
    where table_catalog_name = 'SCHOOL_WELLBEING_DEMO'
      and table_schema_name = 'RAW'
      and table_name = 'MONGO_WELLBEING_SUBMISSIONS'
),

query_summary as (
    select
        coalesce(count_if(
            execution_status != 'SUCCESS'
            and start_time >= dateadd(hour, -24, current_timestamp())
        ), 0) as failed_query_count_24h,
        max(case when execution_status != 'SUCCESS' then start_time end) as last_failed_query_at
    from snowflake.account_usage.query_history
    where start_time >= dateadd(day, -7, current_timestamp())
      and warehouse_name in (
        'WELLBEING_DEMO_LOAD_WH',
        'WELLBEING_DEMO_TRANSFORM_WH',
        'WELLBEING_DEMO_APP_WH'
      )
      and coalesce(query_tag, '') != 'wellbeing_demo_acceptance_expected_failure'
),

warehouse_summary as (
    select
        coalesce(sum(case
            when warehouse_name = 'WELLBEING_DEMO_LOAD_WH'
             and start_time >= dateadd(hour, -24, current_timestamp())
            then credits_used
        end), 0) as load_warehouse_credits_24h,
        coalesce(sum(case
            when warehouse_name = 'WELLBEING_DEMO_TRANSFORM_WH'
             and start_time >= dateadd(hour, -24, current_timestamp())
            then credits_used
        end), 0) as transform_warehouse_credits_24h,
        coalesce(sum(case
            when warehouse_name = 'WELLBEING_DEMO_APP_WH'
             and start_time >= dateadd(hour, -24, current_timestamp())
            then credits_used
        end), 0) as app_warehouse_credits_24h,
        coalesce(sum(case
            when start_time >= dateadd(hour, -24, current_timestamp())
            then credits_used
        end), 0) as total_credits_24h,
        coalesce(sum(credits_used), 0) as total_credits_30d
    from snowflake.account_usage.warehouse_metering_history
    where start_time >= dateadd(day, -30, current_timestamp())
      and warehouse_name in (
        'WELLBEING_DEMO_LOAD_WH',
        'WELLBEING_DEMO_TRANSFORM_WH',
        'WELLBEING_DEMO_APP_WH'
      )
),

metrics as (
    select
        current_timestamp() as observed_at,
        greatest_ignore_nulls(
            raw_state.raw_last_loaded_at,
            copy_summary.last_copy_success_at
        ) as last_successful_load_at,
        greatest_ignore_nulls(
            audit_summary.last_audited_failure_at,
            copy_summary.last_copy_failure_at
        ) as last_failed_load_at,
        case
            when audit_summary.last_audited_failure_at is null
              or copy_summary.last_copy_failure_at > audit_summary.last_audited_failure_at
                then copy_summary.last_copy_failed_file
            else audit_summary.last_audited_failed_file
        end as last_failed_file,
        audit_summary.failed_run_count_7d + copy_summary.account_failed_load_count_7d as failed_load_count_7d,
        query_summary.failed_query_count_24h,
        query_summary.last_failed_query_at,
        raw_state.raw_row_count,
        audit_summary.audited_run_count_30d,
        audit_summary.successful_run_count_30d,
        audit_summary.failed_run_count_30d,
        warehouse_summary.load_warehouse_credits_24h,
        warehouse_summary.transform_warehouse_credits_24h,
        warehouse_summary.app_warehouse_credits_24h,
        warehouse_summary.total_credits_24h,
        warehouse_summary.total_credits_30d,
        try_to_decimal('{{ env_var("SNOWFLAKE_CREDIT_PRICE", "0") }}', 18, 4) as configured_credit_price,
        upper('{{ env_var("SNOWFLAKE_COST_CURRENCY", "NOT_CONFIGURED") }}') as configured_cost_currency
    from raw_state
    cross join audit_summary
    cross join copy_summary
    cross join query_summary
    cross join warehouse_summary
)

select
    observed_at,
    case
        when last_successful_load_at is null then 'NO_DATA'
        when failed_load_count_7d > 0 or failed_query_count_24h > 0 then 'ATTENTION'
        when last_successful_load_at < dateadd(day, -7, observed_at) then 'STALE'
        else 'HEALTHY'
    end as operational_status,
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
    round(load_warehouse_credits_24h, 4) as load_warehouse_credits_24h,
    round(transform_warehouse_credits_24h, 4) as transform_warehouse_credits_24h,
    round(app_warehouse_credits_24h, 4) as app_warehouse_credits_24h,
    round(total_credits_24h, 4) as total_credits_24h,
    round(total_credits_30d, 4) as total_credits_30d,
    configured_credit_price,
    configured_cost_currency,
    case
        when configured_credit_price > 0
            then round(total_credits_30d * configured_credit_price, 2)
    end as approximate_cost_30d,
    'ACCOUNT_USAGE COPY_HISTORY includes COPY and Snowpipe but can lag; RAW timestamps provide immediate load evidence.' as account_usage_latency_note
from metrics
