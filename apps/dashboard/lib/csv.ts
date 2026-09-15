import type { TrendRow } from "./types";

function safeCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  let rendered = String(value);
  if (/^[=+@-]/.test(rendered)) rendered = `'${rendered}`;
  return /[",\r\n]/.test(rendered) ? `"${rendered.replaceAll('"', '""')}"` : rendered;
}

export function trendRowsToCsv(rows: TrendRow[]): string {
  const header = [
    "school_id", "school_classification", "survey_period", "category_code",
    "question_code", "indicator_label", "eligible_submission_count",
    "answered_response_count", "missing_response_count", "is_suppressed",
    "adverse_response_count", "adverse_response_rate",
    "previous_adverse_response_rate", "period_change_pp",
    "trust_adverse_response_rate", "trust_gap_pp", "coverage_status",
    "movement_status", "interpretation_note"
  ];
  const body = rows.map((row) => [
    row.schoolId, row.schoolClassification, row.surveyPeriod, row.categoryCode,
    row.questionCode, row.indicatorLabel, row.eligibleSubmissionCount,
    row.answeredResponseCount, row.missingResponseCount, row.isSuppressed,
    row.adverseResponseCount, row.adverseResponseRate,
    row.previousAdverseResponseRate, row.periodChangePp,
    row.trustAdverseResponseRate, row.trustGapPp, row.coverageStatus,
    row.movementStatus, row.interpretationNote
  ].map(safeCell).join(","));
  return `${header.join(",")}\r\n${body.join("\r\n")}\r\n`;
}
