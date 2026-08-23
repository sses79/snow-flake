select
  submission.document_id,
  submission.trust_id,
  submission.school_id,
  submission.school_classification,
  submission.year_group,
  submission.survey_period,
  submission.submitted_at,
  answer.key::string as question_code,
  nullif(answer.value::string, 'null') as answer_value
from {{ ref('int_wellbeing_submission_current') }} as submission,
lateral flatten(input => submission.answers) as answer
