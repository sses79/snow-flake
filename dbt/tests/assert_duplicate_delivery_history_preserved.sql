with replayed_event as (
    select envelope:event_id::string as event_id
    from {{ source('raw', 'mongo_wellbeing_submissions') }}
    where envelope:batch_id::string = 'batch_m2_replay_late_older'
    limit 1
),

counts as (
    select
        (
            select count(*)
            from {{ source('raw', 'mongo_wellbeing_submissions') }}
            where envelope:event_id::string = (select event_id from replayed_event)
        ) as physical_delivery_count,
        (
            select count(*)
            from {{ ref('stg_wellbeing_submission_changes') }}
            where event_id = (select event_id from replayed_event)
        ) as logical_event_count
)

select *
from counts
where physical_delivery_count < 2
   or logical_event_count != 1
