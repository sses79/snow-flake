select document_id, question_code, count(*) as row_count
from {{ ref('fct_wellbeing_response') }}
group by 1, 2
having count(*) > 1
