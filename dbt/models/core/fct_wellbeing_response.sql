select
  document_id,
  trust_id,
  school_id,
  school_classification,
  year_group,
  survey_period,
  submitted_at,
  question_code,
  answer_value,
  answer_value is not null as is_answered,
  case
    when question_code in ('sad_or_upset', 'lonely', 'stressed_or_anxious', 'bad_tempered_or_angry')
      then lower(answer_value) in ('most days', 'every day')
    when question_code in ('confident', 'happy')
      then lower(answer_value) in ('rarely', 'never')
    when question_code = 'happiness_with_number_of_good_friends'
      then lower(answer_value) in ('unhappy', 'very unhappy')
    when question_code = 'bullying_frequency'
      then lower(answer_value) in ('every day', 'most days', 'every week')
    when question_code like 'safety_%'
      then lower(answer_value) in ('unsafe', 'very unsafe')
    when question_code in (
      'school_belonging', 'school_helps_when_worried', 'enjoys_school',
      'school_is_welcoming_and_caring', 'relationship_with_school_staff'
    ) then lower(answer_value) in ('disagree', 'strongly disagree')
    when question_code = 'healthy_lifestyle_encouragement'
      then lower(answer_value) in ('poor', 'very poor')
    else false
  end as is_adverse_response
from {{ ref('int_wellbeing_answers') }}
