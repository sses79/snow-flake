select trust_id, school_id, survey_period, question_code, count(*) as row_count
from {{ ref('mart_school_indicator_analysis') }}
group by 1, 2, 3, 4
having count(*) != 1
