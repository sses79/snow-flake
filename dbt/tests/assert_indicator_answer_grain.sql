select question_code, lower(answer_value) as answer_value, count(*) as row_count
from {{ ref('dim_wellbeing_indicator_answer') }}
group by 1, 2
having count(*) != 1
