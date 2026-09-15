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

fact_totals as (
    select
        trust_id,
        school_id,
        school_classification,
        survey_period,
        question_code,
        count(*) as answered_response_count,
        count_if(is_adverse_response) as adverse_response_count
    from {{ ref('fct_wellbeing_response') }}
    where is_answered
    group by 1, 2, 3, 4, 5
)

select * from support_totals
minus
select * from fact_totals

union all

select * from fact_totals
minus
select * from support_totals
