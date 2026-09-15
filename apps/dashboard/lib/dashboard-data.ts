import { dashboardQueries, type QueryDefinition } from "./query-contract";
import { getTenantConfig, type TenantConfig } from "./tenant";
import type {
  DashboardData,
  DashboardFilters,
  DistributionRow,
  Freshness,
  SupportSignalRow,
  TrendRow
} from "./types";

export type DashboardRequest = {
  schoolId?: string;
  questionCode?: string;
  periodFrom?: string;
  periodTo?: string;
};

export type QueryRunner = (query: QueryDefinition) => Promise<Array<Record<string, unknown>>>;

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Expected ${key} to be text`);
  return value;
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
}

function number(row: Record<string, unknown>, key: string): number {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`Expected ${key} to be numeric`);
  return value;
}

function nullableNumber(row: Record<string, unknown>, key: string): number | null {
  return row[key] === null || row[key] === undefined ? null : number(row, key);
}

function timestamp(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  throw new Error(`Expected ${key} to be a timestamp`);
}

function periodOrder(period: string): number {
  const [year, season] = period.split("_");
  const seasons: Record<string, number> = { winter: 1, spring: 2, summer: 3, autumn: 4 };
  return Number(year) * 10 + (seasons[season] ?? 5);
}

function buildFilters(rows: Array<Record<string, unknown>>, tenant: TenantConfig): DashboardFilters {
  const schools = new Map<string, string | null>();
  const periods = new Set<string>();
  const questions = new Set<string>();
  for (const row of rows) {
    schools.set(text(row, "SCHOOL_ID"), nullableText(row, "SCHOOL_CLASSIFICATION"));
    periods.add(text(row, "SURVEY_PERIOD"));
    questions.add(text(row, "QUESTION_CODE"));
  }
  return {
    trustId: tenant.id,
    schools: [...schools].map(([id, classification]) => ({ id, classification })),
    periods: [...periods].sort((left, right) => periodOrder(left) - periodOrder(right)),
    questions: [...questions].sort()
  };
}

function validatedSelection(filters: DashboardFilters, request: DashboardRequest) {
  if (filters.periods.length === 0 || filters.questions.length === 0) {
    throw new Error("The dashboard secure views contain no trend data");
  }
  const questionCode = request.questionCode ?? (filters.questions.includes("happy") ? "happy" : filters.questions[0]);
  const periodFrom = request.periodFrom ?? filters.periods[0];
  const periodTo = request.periodTo ?? filters.periods.at(-1)!;
  const schoolId = request.schoolId || null;
  if (!filters.questions.includes(questionCode)) throw new Error("Unknown question filter");
  if (!filters.periods.includes(periodFrom) || !filters.periods.includes(periodTo)) throw new Error("Unknown period filter");
  if (filters.periods.indexOf(periodFrom) > filters.periods.indexOf(periodTo)) throw new Error("Start period must not follow end period");
  if (schoolId && !filters.schools.some(({ id }) => id === schoolId)) throw new Error("Unknown school filter");
  return { schoolId, questionCode, periodFrom, periodTo, detailPeriod: periodTo };
}

export async function loadDashboardData(
  runQuery: QueryRunner,
  request: DashboardRequest = {},
  tenant = getTenantConfig()
): Promise<DashboardData> {
  const initialQueries = dashboardQueries(tenant, "happy", null, "unused");
  const filters = buildFilters(await runQuery(initialQueries.filters), tenant);
  const selection = validatedSelection(filters, request);
  const queries = dashboardQueries(tenant, selection.questionCode, selection.schoolId, selection.detailPeriod);
  const [trendRows, distributionRows, supportRows, freshnessRows] = await Promise.all([
    runQuery(queries.trend),
    runQuery(queries.distribution),
    runQuery(queries.supportSignals),
    runQuery(queries.freshness)
  ]);
  const fromIndex = filters.periods.indexOf(selection.periodFrom);
  const toIndex = filters.periods.indexOf(selection.periodTo);
  const selectedPeriods = new Set(filters.periods.slice(fromIndex, toIndex + 1));

  const trend: TrendRow[] = trendRows
    .filter((row) => selectedPeriods.has(text(row, "SURVEY_PERIOD")))
    .map((row) => ({
      schoolId: text(row, "SCHOOL_ID"),
      schoolClassification: nullableText(row, "SCHOOL_CLASSIFICATION"),
      surveyPeriod: text(row, "SURVEY_PERIOD"),
      questionCode: text(row, "QUESTION_CODE"),
      eligibleSubmissionCount: number(row, "ELIGIBLE_SUBMISSION_COUNT"),
      answeredResponseCount: number(row, "ANSWERED_RESPONSE_COUNT"),
      adverseResponseCount: number(row, "ADVERSE_RESPONSE_COUNT"),
      adverseResponseRate: number(row, "ADVERSE_RESPONSE_RATE"),
      previousAdverseResponseRate: nullableNumber(row, "PREVIOUS_ADVERSE_RESPONSE_RATE"),
      periodChange: nullableNumber(row, "PERIOD_CHANGE")
    }));
  const distribution: DistributionRow[] = distributionRows.map((row) => ({
    answerValue: text(row, "ANSWER_VALUE"),
    responseCount: number(row, "RESPONSE_COUNT"),
    answeredResponseCount: number(row, "ANSWERED_RESPONSE_COUNT"),
    responseRate: number(row, "RESPONSE_RATE")
  }));
  const supportSignals: SupportSignalRow[] = supportRows.map((row) => ({
    schoolId: text(row, "SCHOOL_ID"),
    schoolClassification: nullableText(row, "SCHOOL_CLASSIFICATION"),
    surveyPeriod: text(row, "SURVEY_PERIOD"),
    category: text(row, "SUPPORT_SIGNAL_CATEGORY"),
    questionCode: text(row, "QUESTION_CODE"),
    answeredResponseCount: number(row, "ANSWERED_RESPONSE_COUNT"),
    adverseResponseCount: number(row, "ADVERSE_RESPONSE_COUNT"),
    adverseResponseRate: number(row, "ADVERSE_RESPONSE_RATE"),
    productSignalLevel: text(row, "PRODUCT_SIGNAL_LEVEL") as SupportSignalRow["productSignalLevel"]
  }));
  const freshnessRow = freshnessRows[0];
  const freshness: Freshness | null = freshnessRow ? {
    lastLoadedAt: timestamp(freshnessRow, "LAST_LOADED_AT"),
    latestSourceUpdatedAt: timestamp(freshnessRow, "LATEST_SOURCE_UPDATED_AT"),
    logicalEventCount: number(freshnessRow, "LOGICAL_EVENT_COUNT")
  } : null;

  return { filters, selection, trend, distribution, supportSignals, freshness };
}
