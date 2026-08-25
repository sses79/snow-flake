select count(*) as failures
from {{ ref('fct_wellbeing_response') }}
having count(*) != 21954 * 18
