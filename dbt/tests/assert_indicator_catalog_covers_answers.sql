with fact_answers as (
    select distinct question_code, lower(answer_value) as answer_value, is_adverse_response
    from {{ ref('fct_wellbeing_response') }}
    where is_answered
),

catalogue_answers as (
    select question_code, lower(answer_value) as answer_value, is_adverse_answer
    from {{ ref('dim_wellbeing_indicator_answer') }}
)

select fact.*
from fact_answers as fact
left join catalogue_answers as catalogue
    on catalogue.question_code = fact.question_code
    and catalogue.answer_value = fact.answer_value
where catalogue.question_code is null
   or catalogue.is_adverse_answer != fact.is_adverse_response
