select event_id
from {{ ref('stg_wellbeing_submission_changes') }}
where operation = 'upsert'
  and (
      trust_id is null
      or school_id is null
      or survey_period is null
      or submitted_at is null
      or answers is null
  )
