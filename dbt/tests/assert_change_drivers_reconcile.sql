select
    trust_id,
    school_id,
    survey_period,
    category_code,
    sum(category_change_contribution_pp) as driver_change_pp,
    max(category_change_pp) as category_change_pp
from {{ ref('mart_school_change_drivers') }}
where not is_suppressed
  and category_change_pp is not null
group by 1, 2, 3, 4
having abs(sum(category_change_contribution_pp) - max(category_change_pp)) > 0.06
