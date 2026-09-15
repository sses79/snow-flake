select 1
from {{ ref('mart_pipeline_health') }}
having count(*) != 1
