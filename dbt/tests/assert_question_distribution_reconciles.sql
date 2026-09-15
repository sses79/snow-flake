with distribution_totals as (
    select
        trust_id,
        school_id,
        school_classification,
        survey_period,
        question_code,
        sum(response_count) as response_count
    from {{ ref('mart_question_response_distribution') }}
    group by 1, 2, 3, 4, 5
),

fact_totals as (
    select
        trust_id,
        school_id,
        school_classification,
        survey_period,
        question_code,
        count_if(is_answered) as response_count
    from {{ ref('fct_wellbeing_response') }}
    group by 1, 2, 3, 4, 5
)

select * from distribution_totals
minus
select * from fact_totals

union all

select * from fact_totals
minus
select * from distribution_totals
