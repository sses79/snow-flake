import assert from "node:assert/strict";
import test from "node:test";
import { trendRowsToCsv } from "../lib/csv.ts";
import { loadDashboardData, type QueryRunner } from "../lib/dashboard-data.ts";
import { getTenantConfig } from "../lib/tenant.ts";

const metadata = {
  INDICATOR_LABEL: "Low happiness", CATEGORY_CODE: "emotional_wellbeing",
  CATEGORY_LABEL: "Emotional wellbeing", INTERPRETATION_NOTE: "Aggregate interpretation"
};

const filterRows = [
  { SCHOOL_ID: "school_001", SCHOOL_CLASSIFICATION: "Secondary", SURVEY_PERIOD: "2018_autumn", QUESTION_CODE: "happy", ...metadata },
  { SCHOOL_ID: "school_001", SCHOOL_CLASSIFICATION: "Secondary", SURVEY_PERIOD: "2019_summer", QUESTION_CODE: "happy", ...metadata }
];

const runQuery: QueryRunner = async ({ sqlText }) => {
  if (sqlText.startsWith("SELECT DISTINCT")) return filterRows;
  if (sqlText.includes("FROM SCHOOL_WELLBEING_DEMO.MARTS.MART_TRUST_NORTH_SCHOOL_INDICATOR_ANALYSIS") && sqlText.includes("WHERE question_code")) return [{
    SCHOOL_ID: "school_001", SCHOOL_CLASSIFICATION: "Secondary", SURVEY_PERIOD: "2019_summer",
    QUESTION_CODE: "happy", ...metadata, ELIGIBLE_SUBMISSION_COUNT: 100,
    ANSWERED_RESPONSE_COUNT: 95, MISSING_RESPONSE_COUNT: 5, IS_SUPPRESSED: false,
    ADVERSE_RESPONSE_COUNT: 14, ADVERSE_RESPONSE_RATE: 0.1474, MISSING_RESPONSE_RATE: 0.05,
    PREVIOUS_ADVERSE_RESPONSE_RATE: 0.12, PERIOD_CHANGE_PP: 2.74,
    TRUST_ADVERSE_RESPONSE_RATE: 0.13, TRUST_GAP_PP: 1.74,
    COVERAGE_STATUS: "adequate", MOVEMENT_STATUS: "worsening"
  }];
  if (sqlText.includes("BOOLOR_AGG")) return [{
    ANSWER_VALUE: "Every day", ANSWER_DISPLAY_ORDER: 5, IS_SUPPRESSED: false,
    RESPONSE_COUNT: 60, ANSWERED_RESPONSE_COUNT: 95, RESPONSE_RATE: 0.6316
  }];
  if (sqlText.includes("SCHOOL_CATEGORY_ANALYSIS")) return [{
    SCHOOL_ID: "school_001", SCHOOL_CLASSIFICATION: "Secondary", SURVEY_PERIOD: "2019_summer",
    CATEGORY_CODE: "emotional_wellbeing", CATEGORY_LABEL: "Emotional wellbeing",
    ELIGIBLE_SUBMISSION_COUNT: 100, INDICATOR_COUNT: 6, ANSWERED_QUESTION_RESPONSE_COUNT: 570,
    IS_SUPPRESSED: false, ADVERSE_QUESTION_RESPONSE_RATE: 0.15,
    MISSING_QUESTION_RESPONSE_RATE: 0.05, PREVIOUS_ADVERSE_QUESTION_RESPONSE_RATE: 0.13,
    PERIOD_CHANGE_PP: 2, TRUST_ADVERSE_QUESTION_RESPONSE_RATE: 0.14, TRUST_GAP_PP: 1
  }];
  if (sqlText.includes("SCHOOL_CHANGE_DRIVERS")) return [{
    SCHOOL_ID: "school_001", SCHOOL_CLASSIFICATION: "Secondary", SURVEY_PERIOD: "2019_summer",
    CATEGORY_CODE: "emotional_wellbeing", CATEGORY_LABEL: "Emotional wellbeing",
    QUESTION_CODE: "happy", INDICATOR_LABEL: "Low happiness", INTERPRETATION_NOTE: "Aggregate interpretation",
    ELIGIBLE_SUBMISSION_COUNT: 100, IS_SUPPRESSED: false, ADVERSE_RESPONSE_RATE: 0.1474,
    PREVIOUS_ADVERSE_RESPONSE_RATE: 0.12, INDICATOR_CHANGE_PP: 2.74, CATEGORY_CHANGE_PP: 2,
    CATEGORY_CHANGE_CONTRIBUTION_PP: 0.45, DRIVER_RANK: 1
  }];
  return [{
    LAST_LOADED_AT: new Date("2026-09-15T10:00:00Z"),
    LATEST_SOURCE_UPDATED_AT: new Date("2019-06-30T10:00:00Z"), LOGICAL_EVENT_COUNT: 100
  }];
};

test("returns benchmarked, aggregate-only analytical data", async () => {
  const data = await loadDashboardData(runQuery, {}, getTenantConfig("trust_north"));
  assert.equal(data.filters.trustId, "trust_north");
  assert.equal(data.selection.categoryCode, "emotional_wellbeing");
  assert.equal(data.selection.questionCode, "happy");
  assert.equal(data.trend[0].periodChangePp, 2.74);
  assert.equal(data.trend[0].trustGapPp, 1.74);
  assert.equal(data.categories[0].indicatorCount, 6);
  assert.equal(data.changeDrivers[0].categoryChangeContributionPp, 0.45);
  assert.equal(data.freshness?.lastLoadedAt, "2026-09-15T10:00:00.000Z");
  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /document_id|respondent_id|private.key|password|token/i);
});

test("rejects filters outside values returned by the secure view", async () => {
  await assert.rejects(
    loadDashboardData(runQuery, { schoolId: "school_999" }, getTenantConfig("trust_north")),
    /Unknown school filter/
  );
});

test("aggregate CSV retains suppression and prevents spreadsheet formulas", async () => {
  const data = await loadDashboardData(runQuery, {}, getTenantConfig("trust_north"));
  const csv = trendRowsToCsv([{ ...data.trend[0], schoolId: "=unsafe", isSuppressed: true,
    adverseResponseCount: null, adverseResponseRate: null, periodChangePp: null, trustGapPp: null }]);
  assert.match(csv, /'=unsafe/);
  assert.match(csv, /,true,,,/);
  assert.doesNotMatch(csv, /document_id|respondent_id/);
});
