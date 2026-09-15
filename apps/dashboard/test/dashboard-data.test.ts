import assert from "node:assert/strict";
import test from "node:test";
import { loadDashboardData, type QueryRunner } from "../lib/dashboard-data.ts";
import { getTenantConfig } from "../lib/tenant.ts";

const filterRows = [
  { SCHOOL_ID: "school_001", SCHOOL_CLASSIFICATION: "Secondary", SURVEY_PERIOD: "2018_autumn", QUESTION_CODE: "happy" },
  { SCHOOL_ID: "school_001", SCHOOL_CLASSIFICATION: "Secondary", SURVEY_PERIOD: "2019_summer", QUESTION_CODE: "happy" }
];

const runQuery: QueryRunner = async ({ sqlText }) => {
  if (sqlText.startsWith("SELECT DISTINCT")) return filterRows;
  if (sqlText.startsWith("WITH selected")) return [{
    SCHOOL_ID: "school_001", SCHOOL_CLASSIFICATION: "Secondary", SURVEY_PERIOD: "2019_summer",
    QUESTION_CODE: "happy", ELIGIBLE_SUBMISSION_COUNT: 100, ANSWERED_RESPONSE_COUNT: 95,
    ADVERSE_RESPONSE_COUNT: 14, ADVERSE_RESPONSE_RATE: 0.1474,
    PREVIOUS_ADVERSE_RESPONSE_RATE: 0.12, PERIOD_CHANGE: 0.0274
  }];
  if (sqlText.includes("SUM(response_count)")) return [{
    ANSWER_VALUE: "Every day", RESPONSE_COUNT: 60, ANSWERED_RESPONSE_COUNT: 95, RESPONSE_RATE: 0.6316
  }];
  if (sqlText.includes("support_signal_category")) return [{
    SCHOOL_ID: "school_001", SCHOOL_CLASSIFICATION: "Secondary", SURVEY_PERIOD: "2019_summer",
    SUPPORT_SIGNAL_CATEGORY: "emotional_wellbeing", QUESTION_CODE: "happy",
    ANSWERED_RESPONSE_COUNT: 95, ADVERSE_RESPONSE_COUNT: 14, ADVERSE_RESPONSE_RATE: 0.1474,
    PRODUCT_SIGNAL_LEVEL: "watch"
  }];
  return [{
    LAST_LOADED_AT: new Date("2026-09-15T10:00:00Z"),
    LATEST_SOURCE_UPDATED_AT: new Date("2019-06-30T10:00:00Z"), LOGICAL_EVENT_COUNT: 100
  }];
};

test("returns an aggregate-only browser contract", async () => {
  const data = await loadDashboardData(runQuery, {}, getTenantConfig("trust_north"));
  assert.equal(data.filters.trustId, "trust_north");
  assert.equal(data.selection.questionCode, "happy");
  assert.equal(data.trend[0].periodChange, 0.0274);
  assert.equal(data.supportSignals[0].productSignalLevel, "watch");
  assert.equal(data.freshness?.lastLoadedAt, "2026-09-15T10:00:00.000Z");
  const serialized = JSON.stringify(data);
  assert.doesNotMatch(serialized, /document_id|respondent_id|answer_value.*submission|private.key|password/i);
});

test("rejects filters outside the values returned by the secure view", async () => {
  await assert.rejects(
    loadDashboardData(runQuery, { schoolId: "school_999" }, getTenantConfig("trust_north")),
    /Unknown school filter/
  );
});
