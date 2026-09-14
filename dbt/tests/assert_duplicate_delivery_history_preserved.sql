with counts as (
    select
        (select count(*) from {{ source('raw', 'mongo_wellbeing_submissions') }}) as raw_row_count,
        (select count(*) from {{ ref('stg_wellbeing_submission_changes') }}) as logical_event_count
)

select *
from counts
where raw_row_count - logical_event_count != 2
