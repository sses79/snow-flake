import type { TenantConfig } from "./tenant";

export type QueryDefinition = { sqlText: string; binds?: Array<string | null> };

const PERIOD_ORDER = `TRY_TO_NUMBER(SPLIT_PART(survey_period, '_', 1)), CASE LOWER(SPLIT_PART(survey_period, '_', 2))
        WHEN 'winter' THEN 1 WHEN 'spring' THEN 2 WHEN 'summer' THEN 3 WHEN 'autumn' THEN 4 ELSE 5 END`;

export function dashboardQueries(
  tenant: TenantConfig,
  questionCode: string,
  schoolId: string | null,
  detailPeriod: string
): Record<"filters" | "trend" | "distribution" | "supportSignals" | "freshness", QueryDefinition> {
  const schoolPredicate = schoolId ? " AND school_id = ?" : "";
  const schoolBinds = schoolId ? [schoolId] : [];

  return {
    filters: {
      sqlText: `SELECT DISTINCT school_id, school_classification, survey_period, question_code
FROM ${tenant.views.trend}
ORDER BY school_id, survey_period, question_code`
    },
    trend: {
      sqlText: `WITH selected AS (
    SELECT school_id, school_classification, survey_period, question_code,
        eligible_submission_count, answered_response_count,
        adverse_response_count, adverse_response_rate
    FROM ${tenant.views.trend}
    WHERE question_code = ?${schoolPredicate}
), with_previous AS (
    SELECT *, LAG(adverse_response_rate) OVER (
        PARTITION BY school_id, question_code ORDER BY ${PERIOD_ORDER}
    ) AS previous_adverse_response_rate
    FROM selected
)
SELECT *, adverse_response_rate - previous_adverse_response_rate AS period_change
FROM with_previous
ORDER BY ${PERIOD_ORDER}, school_id`,
      binds: [questionCode, ...schoolBinds]
    },
    distribution: {
      sqlText: `SELECT answer_value, SUM(response_count) AS response_count,
    SUM(SUM(response_count)) OVER () AS answered_response_count,
    ROUND(SUM(response_count) / NULLIF(SUM(SUM(response_count)) OVER (), 0), 4) AS response_rate
FROM ${tenant.views.distribution}
WHERE question_code = ? AND survey_period = ?${schoolPredicate}
GROUP BY answer_value
ORDER BY response_count DESC, answer_value`,
      binds: [questionCode, detailPeriod, ...schoolBinds]
    },
    supportSignals: {
      sqlText: `SELECT school_id, school_classification, survey_period,
    support_signal_category, question_code, answered_response_count,
    adverse_response_count, adverse_response_rate, product_signal_level
FROM ${tenant.views.supportSignals}
WHERE survey_period = ?${schoolPredicate}
ORDER BY adverse_response_rate DESC, school_id, question_code
LIMIT 100`,
      binds: [detailPeriod, ...schoolBinds]
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
