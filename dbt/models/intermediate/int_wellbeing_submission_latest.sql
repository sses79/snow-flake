select * exclude (_latest_rank)
from (
  select
    *,
    row_number() over (
      partition by document_id
      order by source_version desc, source_updated_at desc, event_id desc
    ) as _latest_rank
  from {{ ref('stg_wellbeing_submission_changes') }}
)
where _latest_rank = 1
