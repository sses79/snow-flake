select
    trust_id,
    school_id,
    survey_period,
    question_code,
    sum(response_rate) as total_response_rate
from {{ ref('mart_question_response_distribution') }}
where not is_suppressed
group by 1, 2, 3, 4
having abs(sum(response_rate) - 1) > 0.001
