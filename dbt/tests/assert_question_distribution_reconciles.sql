with distribution_totals as (
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
        sum(response_count) as response_count
    from {{ ref('mart_question_response_distribution') }}
    group by 1, 2, 4, 5
),

fact_totals as (
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
        iff(
            count(distinct document_id) < 10,
            null,
            count_if(is_answered)
        ) as response_count
    from {{ ref('fct_wellbeing_response') }}
    group by 1, 2, 4, 5
)

select * from distribution_totals
minus
select * from fact_totals

union all

select * from fact_totals
minus
select * from distribution_totals
