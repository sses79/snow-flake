select
  trust_id,
  school_id,
  school_classification,
  survey_period,
  question_code,
  count(distinct document_id) as eligible_submission_count,
  count_if(is_answered) as answered_response_count,
  count_if(not is_answered) as missing_response_count,
  count_if(is_answered and is_adverse_response) as adverse_response_count,
  round(
    count_if(is_answered and is_adverse_response) / nullif(count_if(is_answered), 0),
    4
  ) as adverse_response_rate
from {{ ref('fct_wellbeing_response') }}
group by 1, 2, 3, 4, 5
