select *
from {{ ref('mart_pipeline_health') }}
where raw_row_count < 0
   or failed_load_count_7d < 0
   or failed_query_count_24h < 0
   or total_credits_24h < 0
   or total_credits_30d < 0
   or approximate_cost_30d < 0
