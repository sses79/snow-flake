with expected as (
    select document_id, event_id
    from {{ ref('stg_wellbeing_submission_changes') }}
    qualify row_number() over (
        partition by document_id
        order by source_version desc, source_updated_at desc, event_id desc
    ) = 1
),

actual as (
    select document_id, event_id
    from {{ ref('int_wellbeing_submission_latest') }}
),

differences as (
    (select * from expected minus select * from actual)
    union all
    (select * from actual minus select * from expected)
)

select *
from differences
