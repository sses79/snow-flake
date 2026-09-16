with expected as (
    select batch_id, expected_row_count
    from {{ ref('expected_milestone_2_batches') }}
),

actual_by_delivery as (
    select
        envelope:batch_id::string as batch_id,
        source_file,
        count(*) as actual_row_count
    from {{ source('raw', 'mongo_wellbeing_submissions') }}
    where envelope:batch_id::string in (select batch_id from expected)
    group by 1, 2
),

invalid_deliveries as (
    select
        actual.batch_id,
        actual.source_file,
        expected.expected_row_count,
        actual.actual_row_count
    from actual_by_delivery as actual
    inner join expected using (batch_id)
    where expected.expected_row_count != actual.actual_row_count
),

missing_batches as (
    select
        expected.batch_id,
        cast(null as string) as source_file,
        expected.expected_row_count,
        0 as actual_row_count
    from expected
    left join actual_by_delivery as actual using (batch_id)
    where actual.batch_id is null
)

select * from invalid_deliveries
union all
select * from missing_batches
