USE ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
USE WAREHOUSE WELLBEING_DEMO_APP_WH;

SET ANALYSIS_QUESTION = 'happy';
SET ANALYSIS_PERIOD = '2019_summer';

SELECT
    school_id,
    indicator_label,
    survey_period,
    answered_response_count,
    adverse_response_rate,
    previous_adverse_response_rate,
    period_change_pp,
    movement_status,
    coverage_status
FROM SCHOOL_WELLBEING_DEMO.MARTS.MART_TRUST_NORTH_SCHOOL_INDICATOR_ANALYSIS
WHERE question_code = $ANALYSIS_QUESTION
  AND survey_period = $ANALYSIS_PERIOD
ORDER BY period_change_pp DESC NULLS LAST;
