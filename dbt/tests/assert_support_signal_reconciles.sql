with support_totals as (
    select
        trust_id,
        school_id,
        school_classification,
        survey_period,
        question_code,
        answered_response_count,
        adverse_response_count
    from {{ ref('mart_support_signal_summary') }}
),

trend_totals as (
    select
        trust_id,
        school_id,
        school_classification,
        survey_period,
        question_code,
        answered_response_count,
        adverse_response_count
    from {{ ref('mart_school_wellbeing_trend') }}
)

select * from support_totals
minus
select * from trend_totals

union all

select * from trend_totals
minus
select * from support_totals
