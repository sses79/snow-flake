with expected as (
    select
        trust_id,
        survey_period,
        question_code,
        count(distinct document_id) as trust_eligible_submission_count,
        count_if(is_answered) as trust_answered_response_count,
        count_if(is_answered and is_adverse_response) as trust_adverse_response_count,
        round(
            count_if(is_answered and is_adverse_response) / nullif(count_if(is_answered), 0),
            4
        ) as trust_adverse_response_rate
    from {{ ref('fct_wellbeing_response') }}
    group by 1, 2, 3
),

actual as (
    select distinct
        trust_id,
        survey_period,
        question_code,
        trust_eligible_submission_count,
        trust_answered_response_count,
        trust_adverse_response_count,
        trust_adverse_response_rate
    from {{ ref('mart_school_indicator_analysis') }}
)

select * from expected
minus
select * from actual

union all

select * from actual
minus
select * from expected
