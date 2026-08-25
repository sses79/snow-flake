select *
from {{ ref('mart_school_wellbeing_trend') }}
where answered_response_count + missing_response_count != eligible_submission_count
   or adverse_response_count > answered_response_count
