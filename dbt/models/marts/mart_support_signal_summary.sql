with classified_responses as (
    select
        trust_id,
        school_id,
        school_classification,
        survey_period,
        question_code,
        is_adverse_response,
        case
            when question_code in (
                'sad_or_upset', 'lonely', 'confident', 'stressed_or_anxious',
                'happy', 'bad_tempered_or_angry'
            ) then 'emotional_wellbeing'
            when question_code in ('happiness_with_number_of_good_friends', 'bullying_frequency')
                then 'peer_relationships'
            when question_code like 'safety_%' then 'safety'
            when question_code in (
                'school_belonging', 'school_helps_when_worried', 'enjoys_school',
                'school_is_welcoming_and_caring', 'relationship_with_school_staff'
            ) then 'school_support'
            when question_code = 'healthy_lifestyle_encouragement' then 'physical_wellbeing'
        end as support_signal_category
    from {{ ref('fct_wellbeing_response') }}
    where is_answered
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
        count_if(is_adverse_response) as adverse_response_count,
        round(count_if(is_adverse_response) / nullif(count(*), 0), 4) as adverse_response_rate
    from classified_responses
    where support_signal_category is not null
    group by 1, 2, 3, 4, 5, 6
)

select
    *,
    case
        when adverse_response_rate >= 0.20 then 'elevated'
        when adverse_response_rate >= 0.10 then 'watch'
        else 'lower'
    end as product_signal_level
from aggregated
