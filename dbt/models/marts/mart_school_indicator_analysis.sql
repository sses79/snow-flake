with indicator as (
    select distinct
        question_code,
        indicator_label,
        category_code,
        category_label,
        direction,
        interpretation_note
    from {{ ref('dim_wellbeing_indicator_answer') }}
),

school_period as (
    select
        fact.trust_id,
        fact.school_id,
        iff(
            count(distinct fact.school_classification) = 1,
            max(fact.school_classification),
            'Mixed source classifications'
        ) as school_classification,
        fact.survey_period,
        fact.question_code,
        count(distinct fact.document_id) as eligible_submission_count,
        count_if(fact.is_answered) as answered_response_count,
        count_if(not fact.is_answered) as missing_response_count,
        count_if(fact.is_answered and fact.is_adverse_response) as adverse_response_count_raw
    from {{ ref('fct_wellbeing_response') }} as fact
    group by 1, 2, 4, 5
),

trust_period as (
    select
        trust_id,
        survey_period,
        question_code,
        sum(eligible_submission_count) as trust_eligible_submission_count,
        sum(answered_response_count) as trust_answered_response_count,
        sum(adverse_response_count_raw) as trust_adverse_response_count_raw
    from school_period
    group by 1, 2, 3
),

protected as (
    select
        school.*,
        indicator.indicator_label,
        indicator.category_code,
        indicator.category_label,
        indicator.direction,
        indicator.interpretation_note,
        school.eligible_submission_count < 10 as is_suppressed,
        iff(school.eligible_submission_count < 10, null, school.adverse_response_count_raw) as adverse_response_count,
        iff(
            school.eligible_submission_count < 10,
            null,
            round(school.adverse_response_count_raw / nullif(school.answered_response_count, 0), 4)
        ) as adverse_response_rate,
        iff(
            school.eligible_submission_count < 10,
            null,
            round(school.missing_response_count / nullif(school.eligible_submission_count, 0), 4)
        ) as missing_response_rate,
        trust.trust_eligible_submission_count,
        trust.trust_answered_response_count,
        iff(trust.trust_eligible_submission_count < 10, null, trust.trust_adverse_response_count_raw) as trust_adverse_response_count,
        iff(
            trust.trust_eligible_submission_count < 10,
            null,
            round(trust.trust_adverse_response_count_raw / nullif(trust.trust_answered_response_count, 0), 4)
        ) as trust_adverse_response_rate
    from school_period as school
    inner join trust_period as trust
        on trust.trust_id = school.trust_id
        and trust.survey_period = school.survey_period
        and trust.question_code = school.question_code
    inner join indicator
        on indicator.question_code = school.question_code
),

with_previous as (
    select
        *,
        lag(adverse_response_count) over (
            partition by trust_id, school_id, question_code
            order by try_to_number(split_part(survey_period, '_', 1)),
                decode(lower(split_part(survey_period, '_', 2)), 'winter', 1, 'spring', 2, 'summer', 3, 'autumn', 4, 5)
        ) as previous_adverse_response_count,
        lag(answered_response_count) over (
            partition by trust_id, school_id, question_code
            order by try_to_number(split_part(survey_period, '_', 1)),
                decode(lower(split_part(survey_period, '_', 2)), 'winter', 1, 'spring', 2, 'summer', 3, 'autumn', 4, 5)
        ) as previous_answered_response_count,
        lag(adverse_response_rate) over (
            partition by trust_id, school_id, question_code
            order by try_to_number(split_part(survey_period, '_', 1)),
                decode(lower(split_part(survey_period, '_', 2)), 'winter', 1, 'spring', 2, 'summer', 3, 'autumn', 4, 5)
        ) as previous_adverse_response_rate
    from protected
)

select
    * exclude (adverse_response_count_raw),
    round(100 * (adverse_response_rate - previous_adverse_response_rate), 2) as period_change_pp,
    round(100 * (adverse_response_rate - trust_adverse_response_rate), 2) as trust_gap_pp,
    case
        when is_suppressed then 'suppressed'
        when missing_response_rate >= 0.20 then 'limited'
        else 'adequate'
    end as coverage_status,
    case
        when previous_adverse_response_rate is null then 'no_comparison'
        when 100 * (adverse_response_rate - previous_adverse_response_rate) >= 1 then 'worsening'
        when 100 * (adverse_response_rate - previous_adverse_response_rate) <= -1 then 'improving'
        else 'stable'
    end as movement_status
from with_previous
