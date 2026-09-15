select *
from {{ source('governance', 'pipeline_runs') }}
where (status = 'RUNNING' and (completed_at is not null or exit_code is not null))
   or (status in ('SUCCEEDED', 'FAILED') and (completed_at is null or exit_code is null))
   or (status = 'SUCCEEDED' and (
       observed_batch_row_count is null
       or observed_batch_row_count != expected_row_count
   ))
   or expected_row_count < 0
