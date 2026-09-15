with driver_values as (
select
    indicator.trust_id,
    indicator.school_id,
    indicator.school_classification,
    indicator.survey_period,
    indicator.category_code,
    indicator.category_label,
    indicator.question_code,
    indicator.indicator_label,
    indicator.interpretation_note,
    indicator.eligible_submission_count,
    indicator.is_suppressed,
    indicator.adverse_response_rate,
    indicator.previous_adverse_response_rate,
    indicator.period_change_pp as indicator_change_pp,
    category.period_change_pp as category_change_pp,
    iff(
        indicator.is_suppressed or category.previous_answered_question_response_count is null,
        null,
        round(100 * (
            indicator.adverse_response_count / nullif(category.answered_question_response_count, 0) -
            indicator.previous_adverse_response_count / nullif(category.previous_answered_question_response_count, 0)
        ), 2)
    ) as category_change_contribution_pp
from {{ ref('mart_school_indicator_analysis') }} as indicator
inner join {{ ref('mart_school_category_analysis') }} as category
    on category.trust_id = indicator.trust_id
    and category.school_id = indicator.school_id
    and category.survey_period = indicator.survey_period
    and category.category_code = indicator.category_code
)

select
    *,
    rank() over (
        partition by trust_id, school_id, survey_period, category_code
        order by abs(category_change_contribution_pp) desc nulls last, question_code
    ) as driver_rank
from driver_values
