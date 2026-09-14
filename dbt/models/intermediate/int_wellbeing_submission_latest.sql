{{ config(
    materialized='incremental',
    unique_key='document_id',
    incremental_strategy='merge',
    on_schema_change='append_new_columns'
) }}

with incoming_changes as (
    select source.*
    from {{ ref('stg_wellbeing_submission_changes') }} as source
    {% if is_incremental() %}
    where not exists (
        select 1
        from {{ this }} as existing
        where existing.event_id = source.event_id
    )
    {% endif %}
),

candidate_changes as (
    select *
    from incoming_changes

    {% if is_incremental() %}
    union all

    select existing.*
    from {{ this }} as existing
    inner join (
        select distinct document_id
        from incoming_changes
    ) as affected
        on affected.document_id = existing.document_id
    {% endif %}
)

select * exclude (_latest_rank)
from (
    select
        *,
        row_number() over (
            partition by document_id
            order by source_version desc, source_updated_at desc, event_id desc
        ) as _latest_rank
    from candidate_changes
)
where _latest_rank = 1
