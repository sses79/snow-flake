with answered_responses as (
    select
        trust_id,
        school_id,
        iff(
            count(distinct school_classification) = 1,
            max(school_classification),
            'Mixed source classifications'
        ) as school_classification,
        survey_period,
        question_code,
        answer_value,
        count(*) as response_count_raw
    from {{ ref('fct_wellbeing_response') }}
    where is_answered
    group by 1, 2, 4, 5, 6
),

with_denominator as (
    select
        *,
        sum(response_count_raw) over (
            partition by trust_id, school_id, school_classification, survey_period, question_code
        ) as answered_response_count
    from answered_responses
)

select
    response.trust_id,
    response.school_id,
    response.school_classification,
    response.survey_period,
    response.question_code,
    catalogue.indicator_label,
    catalogue.category_code,
    catalogue.category_label,
    response.answer_value,
    catalogue.answer_display_order,
    analysis.eligible_submission_count,
    analysis.is_suppressed,
    iff(analysis.is_suppressed, null, response.response_count_raw) as response_count,
    response.answered_response_count,
    iff(
        analysis.is_suppressed,
        null,
        round(response.response_count_raw / nullif(response.answered_response_count, 0), 4)
    ) as response_rate
from with_denominator as response
inner join {{ ref('dim_wellbeing_indicator_answer') }} as catalogue
    on catalogue.question_code = response.question_code
    and lower(catalogue.answer_value) = lower(response.answer_value)
inner join {{ ref('mart_school_indicator_analysis') }} as analysis
    on analysis.trust_id = response.trust_id
    and analysis.school_id = response.school_id
    and analysis.survey_period = response.survey_period
    and analysis.question_code = response.question_code
