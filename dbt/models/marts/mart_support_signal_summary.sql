with indicator as (
    select distinct question_code, category_code
    from {{ ref('dim_wellbeing_indicator_answer') }}
),

classified_responses as (
    select
        fact.trust_id,
        fact.school_id,
        fact.school_classification,
        fact.survey_period,
        fact.question_code,
        fact.is_adverse_response,
        indicator.category_code as support_signal_category
    from {{ ref('fct_wellbeing_response') }} as fact
    inner join indicator on indicator.question_code = fact.question_code
    where fact.is_answered
),

aggregated as (
    select
        trust_id,
        school_id,
        school_classification,
        survey_period,
        support_signal_category,
        question_code,
        count(*) as answered_response_count,
        count_if(is_adverse_response) as adverse_response_count_raw
    from classified_responses
    group by 1, 2, 3, 4, 5, 6
)

select
    aggregated.trust_id,
    aggregated.school_id,
    aggregated.school_classification,
    aggregated.survey_period,
    aggregated.support_signal_category,
    aggregated.question_code,
    aggregated.answered_response_count,
    analysis.is_suppressed,
    iff(analysis.is_suppressed, null, aggregated.adverse_response_count_raw) as adverse_response_count,
    iff(
        analysis.is_suppressed,
        null,
        round(aggregated.adverse_response_count_raw / nullif(aggregated.answered_response_count, 0), 4)
    ) as adverse_response_rate,
    case
        when analysis.is_suppressed then null
        when aggregated.adverse_response_count_raw / nullif(aggregated.answered_response_count, 0) >= 0.20 then 'elevated'
        when aggregated.adverse_response_count_raw / nullif(aggregated.answered_response_count, 0) >= 0.10 then 'watch'
        else 'lower'
    end as product_signal_level
from aggregated
inner join {{ ref('mart_school_indicator_analysis') }} as analysis
    on analysis.trust_id = aggregated.trust_id
    and analysis.school_id = aggregated.school_id
    and analysis.survey_period = aggregated.survey_period
    and analysis.question_code = aggregated.question_code
