import type { TenantConfig } from "./tenant";

export type QueryDefinition = { sqlText: string; binds?: Array<string | null> };

export function dashboardQueries(
  tenant: TenantConfig,
  questionCode: string,
  categoryCode: string,
  schoolId: string | null,
  detailPeriod: string
): Record<"filters" | "trend" | "distribution" | "categories" | "changeDrivers" | "freshness", QueryDefinition> {
  const schoolPredicate = schoolId ? " AND school_id = ?" : "";
  const schoolBinds = schoolId ? [schoolId] : [];

  return {
    filters: {
      sqlText: `SELECT DISTINCT school_id, school_classification, survey_period,
    question_code, indicator_label, category_code, category_label, interpretation_note
FROM ${tenant.views.indicatorAnalysis}
ORDER BY school_id, survey_period, category_code, question_code`
    },
    trend: {
      sqlText: `SELECT school_id, school_classification, survey_period, question_code,
    indicator_label, category_code, category_label, interpretation_note,
    eligible_submission_count, answered_response_count, missing_response_count,
    is_suppressed, adverse_response_count, adverse_response_rate,
    missing_response_rate, previous_adverse_response_rate, period_change_pp,
    trust_adverse_response_rate, trust_gap_pp, coverage_status, movement_status
FROM ${tenant.views.indicatorAnalysis}
WHERE question_code = ?${schoolPredicate}
ORDER BY survey_period, school_id`,
      binds: [questionCode, ...schoolBinds]
    },
    distribution: {
      sqlText: `SELECT answer_value, MIN(answer_display_order) AS answer_display_order,
    BOOLOR_AGG(is_suppressed) AS is_suppressed,
    SUM(response_count) AS response_count,
    COALESCE(SUM(response_count), 0) AS answered_response_count,
    IFF(BOOLOR_AGG(is_suppressed), NULL,
        ROUND(SUM(response_count) / NULLIF(SUM(SUM(response_count)) OVER (), 0), 4)) AS response_rate
FROM ${tenant.views.distribution}
WHERE question_code = ? AND survey_period = ?${schoolPredicate}
GROUP BY answer_value
ORDER BY answer_display_order`,
      binds: [questionCode, detailPeriod, ...schoolBinds]
    },
    categories: {
      sqlText: `SELECT school_id, school_classification, survey_period, category_code,
    category_label, eligible_submission_count, indicator_count,
    answered_question_response_count, is_suppressed,
    adverse_question_response_rate, missing_question_response_rate,
    previous_adverse_question_response_rate, period_change_pp,
    trust_adverse_question_response_rate, trust_gap_pp
FROM ${tenant.views.categoryAnalysis}
WHERE category_code = ?${schoolPredicate}
ORDER BY survey_period, school_id`,
      binds: [categoryCode, ...schoolBinds]
    },
    changeDrivers: {
      sqlText: `SELECT school_id, school_classification, survey_period, category_code,
    category_label, question_code, indicator_label, interpretation_note,
    eligible_submission_count, is_suppressed, adverse_response_rate,
    previous_adverse_response_rate, indicator_change_pp, category_change_pp,
    category_change_contribution_pp, driver_rank
FROM ${tenant.views.changeDrivers}
WHERE category_code = ? AND survey_period = ?${schoolPredicate}
ORDER BY ABS(category_change_contribution_pp) DESC NULLS LAST, school_id, question_code
LIMIT 100`,
      binds: [categoryCode, detailPeriod, ...schoolBinds]
    },
    freshness: {
      sqlText: `SELECT last_loaded_at, latest_source_updated_at, logical_event_count
FROM ${tenant.views.freshness}`
    }
  };
}

export function referencedObjects(sqlText: string): string[] {
  return [...sqlText.matchAll(/\b(?:FROM|JOIN)\s+([A-Z0-9_.]+)/gi)].map((match) => match[1]);
}
