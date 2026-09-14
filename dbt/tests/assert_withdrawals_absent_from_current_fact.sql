select latest.document_id
from {{ ref('int_wellbeing_submission_latest') }} as latest
inner join {{ ref('fct_wellbeing_response') }} as response
    on response.document_id = latest.document_id
where latest.operation = 'delete'
