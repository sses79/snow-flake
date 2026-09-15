with answered_responses as (
    select
        trust_id,
        school_id,
        school_classification,
        survey_period,
        question_code,
        answer_value,
        count(*) as response_count
    from {{ ref('fct_wellbeing_response') }}
    where is_answered
    group by 1, 2, 3, 4, 5, 6
)

select
    trust_id,
    school_id,
    school_classification,
    survey_period,
    question_code,
    answer_value,
    response_count,
    sum(response_count) over (
        partition by trust_id, school_id, school_classification, survey_period, question_code
    ) as answered_response_count,
    round(
        response_count / nullif(
            sum(response_count) over (
                partition by trust_id, school_id, school_classification, survey_period, question_code
            ),
            0
        ),
        4
    ) as response_rate
from answered_responses
