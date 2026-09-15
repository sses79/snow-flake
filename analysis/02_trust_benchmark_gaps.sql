USE ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
USE WAREHOUSE WELLBEING_DEMO_APP_WH;

SET ANALYSIS_PERIOD = '2019_summer';

SELECT
    school_id,
    category_label,
    indicator_label,
    adverse_response_rate,
    trust_adverse_response_rate,
    trust_gap_pp,
    period_change_pp,
    answered_response_count
FROM SCHOOL_WELLBEING_DEMO.MARTS.MART_TRUST_NORTH_SCHOOL_INDICATOR_ANALYSIS
WHERE survey_period = $ANALYSIS_PERIOD
  AND NOT is_suppressed
ORDER BY trust_gap_pp DESC, period_change_pp DESC;
