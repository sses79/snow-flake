select
    'indicator' as analytical_surface,
    trust_id,
    school_id,
    survey_period,
    question_code as metric_code
from {{ ref('mart_school_indicator_analysis') }}
where is_suppressed
  and (
      adverse_response_count is not null
      or adverse_response_rate is not null
      or missing_response_rate is not null
      or period_change_pp is not null
      or trust_gap_pp is not null
  )

union all

select
    'category' as analytical_surface,
    trust_id,
    school_id,
    survey_period,
    category_code as metric_code
from {{ ref('mart_school_category_analysis') }}
where is_suppressed
  and (
      adverse_question_response_count is not null
      or adverse_question_response_rate is not null
      or missing_question_response_rate is not null
      or period_change_pp is not null
      or trust_gap_pp is not null
  )
