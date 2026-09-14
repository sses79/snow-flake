with expected as (
    select
        document_id,
        trust_id,
        school_id,
        school_classification,
        year_group,
        survey_period,
        submitted_at,
        question_code,
        answer_value
    from {{ ref('int_wellbeing_answers') }}
),

actual as (
    select
        document_id,
        trust_id,
        school_id,
        school_classification,
        year_group,
        survey_period,
        submitted_at,
        question_code,
        answer_value
    from {{ ref('fct_wellbeing_response') }}
),

differences as (
    (select * from expected minus select * from actual)
    union all
    (select * from actual minus select * from expected)
)

select *
from differences
