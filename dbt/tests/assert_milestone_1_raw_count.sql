select count(*) as failures
from {{ source('raw', 'mongo_wellbeing_submissions') }}
having count(*) != 21954
