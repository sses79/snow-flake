select
    indicator.question_code,
    indicator.indicator_label,
    indicator.category_code,
    indicator.category_label,
    indicator.direction,
    indicator.interpretation_note,
    answer.answer_value,
    answer.answer_display_order,
    answer.is_adverse_answer::boolean as is_adverse_answer
from {{ ref('wellbeing_indicator_catalog') }} as indicator
inner join {{ ref('wellbeing_answer_scale') }} as answer
    on answer.scale_code = indicator.scale_code
