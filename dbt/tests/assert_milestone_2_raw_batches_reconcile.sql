with expected as (
    select batch_id, expected_row_count
    from {{ ref('expected_milestone_2_batches') }}
),

actual as (
    select
        envelope:batch_id::string as batch_id,
        count(*) as actual_row_count
    from {{ source('raw', 'mongo_wellbeing_submissions') }}
    group by 1
)

select
    coalesce(expected.batch_id, actual.batch_id) as batch_id,
    expected.expected_row_count,
    actual.actual_row_count
from expected
full outer join actual using (batch_id)
where coalesce(expected.expected_row_count, -1) != coalesce(actual.actual_row_count, -1)
