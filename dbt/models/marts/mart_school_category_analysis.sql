with indicator as (
    select distinct question_code, category_code, category_label
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
        indicator.category_code,
        indicator.category_label,
        count(distinct fact.document_id) as eligible_submission_count,
        count(distinct fact.question_code) as indicator_count,
        count_if(fact.is_answered) as answered_question_response_count,
        count_if(not fact.is_answered) as missing_question_response_count,
        count_if(fact.is_answered and fact.is_adverse_response) as adverse_question_response_count_raw
    from {{ ref('fct_wellbeing_response') }} as fact
    inner join indicator on indicator.question_code = fact.question_code
    group by 1, 2, 4, 5, 6
),

trust_period as (
    select
        trust_id,
        survey_period,
        category_code,
        sum(eligible_submission_count) as trust_eligible_submission_count,
        sum(answered_question_response_count) as trust_answered_question_response_count,
        sum(adverse_question_response_count_raw) as trust_adverse_question_response_count_raw
    from school_period
    group by 1, 2, 3
),

protected as (
    select
        school.*,
        school.eligible_submission_count < 10 as is_suppressed,
        iff(school.eligible_submission_count < 10, null, school.adverse_question_response_count_raw) as adverse_question_response_count,
        iff(
            school.eligible_submission_count < 10,
            null,
            round(school.adverse_question_response_count_raw / nullif(school.answered_question_response_count, 0), 4)
        ) as adverse_question_response_rate,
        iff(
            school.eligible_submission_count < 10,
            null,
            round(
                school.missing_question_response_count /
                nullif(school.answered_question_response_count + school.missing_question_response_count, 0),
                4
            )
        ) as missing_question_response_rate,
        trust.trust_answered_question_response_count,
        iff(trust.trust_eligible_submission_count < 10, null, trust.trust_adverse_question_response_count_raw) as trust_adverse_question_response_count,
        iff(
            trust.trust_eligible_submission_count < 10,
            null,
            round(
                trust.trust_adverse_question_response_count_raw /
                nullif(trust.trust_answered_question_response_count, 0),
                4
            )
        ) as trust_adverse_question_response_rate
    from school_period as school
    inner join trust_period as trust
        on trust.trust_id = school.trust_id
        and trust.survey_period = school.survey_period
        and trust.category_code = school.category_code
),

with_previous as (
    select
        *,
        lag(adverse_question_response_count) over (
            partition by trust_id, school_id, category_code
            order by try_to_number(split_part(survey_period, '_', 1)),
                decode(lower(split_part(survey_period, '_', 2)), 'winter', 1, 'spring', 2, 'summer', 3, 'autumn', 4, 5)
        ) as previous_adverse_question_response_count,
        lag(answered_question_response_count) over (
            partition by trust_id, school_id, category_code
            order by try_to_number(split_part(survey_period, '_', 1)),
                decode(lower(split_part(survey_period, '_', 2)), 'winter', 1, 'spring', 2, 'summer', 3, 'autumn', 4, 5)
        ) as previous_answered_question_response_count,
        lag(adverse_question_response_rate) over (
            partition by trust_id, school_id, category_code
            order by try_to_number(split_part(survey_period, '_', 1)),
                decode(lower(split_part(survey_period, '_', 2)), 'winter', 1, 'spring', 2, 'summer', 3, 'autumn', 4, 5)
        ) as previous_adverse_question_response_rate
    from protected
)

select
    * exclude (adverse_question_response_count_raw),
    round(100 * (adverse_question_response_rate - previous_adverse_question_response_rate), 2) as period_change_pp,
    round(100 * (adverse_question_response_rate - trust_adverse_question_response_rate), 2) as trust_gap_pp
from with_previous
