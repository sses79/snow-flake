USE ROLE WELLBEING_DEMO_TRUST_NORTH_READER;
USE WAREHOUSE WELLBEING_DEMO_APP_WH;

SET ANALYSIS_SCHOOL = 'school_001';
SET ANALYSIS_CATEGORY = 'emotional_wellbeing';
SET ANALYSIS_PERIOD = '2019_summer';

SELECT
    school_id,
    category_label,
    indicator_label,
    adverse_response_rate,
    previous_adverse_response_rate,
    indicator_change_pp,
    category_change_pp,
    category_change_contribution_pp,
    driver_rank,
    interpretation_note
FROM SCHOOL_WELLBEING_DEMO.MARTS.MART_TRUST_NORTH_SCHOOL_CHANGE_DRIVERS
WHERE school_id = $ANALYSIS_SCHOOL
  AND category_code = $ANALYSIS_CATEGORY
  AND survey_period = $ANALYSIS_PERIOD
ORDER BY ABS(category_change_contribution_pp) DESC NULLS LAST;
