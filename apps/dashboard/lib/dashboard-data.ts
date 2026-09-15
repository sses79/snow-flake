import { dashboardQueries, type QueryDefinition } from "./query-contract";
import { getTenantConfig, type TenantConfig } from "./tenant";
import type {
  CategoryRow,
  ChangeDriverRow,
  DashboardData,
  DashboardFilters,
  DistributionRow,
  Freshness,
  QuestionOption,
  TrendRow
} from "./types";

export type DashboardRequest = {
  schoolId?: string;
  categoryCode?: string;
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

function boolean(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  return value === true || value === 1 || value === "true" || value === "TRUE";
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
  const categories = new Map<string, string>();
  const questions = new Map<string, QuestionOption>();
  for (const row of rows) {
    schools.set(text(row, "SCHOOL_ID"), nullableText(row, "SCHOOL_CLASSIFICATION"));
    periods.add(text(row, "SURVEY_PERIOD"));
    const categoryCode = text(row, "CATEGORY_CODE");
    const categoryLabel = text(row, "CATEGORY_LABEL");
    categories.set(categoryCode, categoryLabel);
    const code = text(row, "QUESTION_CODE");
    questions.set(code, {
      code,
      label: text(row, "INDICATOR_LABEL"),
      categoryCode,
      categoryLabel,
      interpretationNote: text(row, "INTERPRETATION_NOTE")
    });
  }
  return {
    trustId: tenant.id,
    schools: [...schools].map(([id, classification]) => ({ id, classification })),
    periods: [...periods].sort((left, right) => periodOrder(left) - periodOrder(right)),
    categories: [...categories].map(([code, label]) => ({ code, label })).sort((left, right) => left.label.localeCompare(right.label)),
    questions: [...questions.values()].sort((left, right) => left.label.localeCompare(right.label))
  };
}

function validatedSelection(filters: DashboardFilters, request: DashboardRequest) {
  if (filters.periods.length === 0 || filters.questions.length === 0 || filters.categories.length === 0) {
    throw new Error("The dashboard secure views contain no analytical data");
  }
  const requestedQuestion = request.questionCode
    ? filters.questions.find(({ code }) => code === request.questionCode)
    : undefined;
  const categoryCode = request.categoryCode ?? requestedQuestion?.categoryCode ??
    (filters.categories.some(({ code }) => code === "emotional_wellbeing") ? "emotional_wellbeing" : filters.categories[0].code);
  if (!filters.categories.some(({ code }) => code === categoryCode)) throw new Error("Unknown category filter");
  const categoryQuestions = filters.questions.filter((question) => question.categoryCode === categoryCode);
  const questionCode = requestedQuestion?.categoryCode === categoryCode
    ? requestedQuestion.code
    : categoryQuestions.find(({ code }) => code === "sad_or_upset")?.code ?? categoryQuestions[0].code;
  const periodFrom = request.periodFrom ?? filters.periods[0];
  const periodTo = request.periodTo ?? filters.periods.at(-1)!;
  const schoolId = request.schoolId || null;
  if (!filters.periods.includes(periodFrom) || !filters.periods.includes(periodTo)) throw new Error("Unknown period filter");
  if (filters.periods.indexOf(periodFrom) > filters.periods.indexOf(periodTo)) throw new Error("Start period must not follow end period");
  if (schoolId && !filters.schools.some(({ id }) => id === schoolId)) throw new Error("Unknown school filter");
  return { schoolId, categoryCode, questionCode, periodFrom, periodTo, detailPeriod: periodTo };
}

export async function loadDashboardData(
  runQuery: QueryRunner,
  request: DashboardRequest = {},
  tenant = getTenantConfig()
): Promise<DashboardData> {
  const initialQueries = dashboardQueries(tenant, "sad_or_upset", "emotional_wellbeing", null, "unused");
  const filters = buildFilters(await runQuery(initialQueries.filters), tenant);
  const selection = validatedSelection(filters, request);
  const queries = dashboardQueries(
    tenant,
    selection.questionCode,
    selection.categoryCode,
    selection.schoolId,
    selection.detailPeriod
  );
  const [trendRows, distributionRows, categoryRows, driverRows, freshnessRows] = await Promise.all([
    runQuery(queries.trend),
    runQuery(queries.distribution),
    runQuery(queries.categories),
    runQuery(queries.changeDrivers),
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
      indicatorLabel: text(row, "INDICATOR_LABEL"),
      categoryCode: text(row, "CATEGORY_CODE"),
      categoryLabel: text(row, "CATEGORY_LABEL"),
      interpretationNote: text(row, "INTERPRETATION_NOTE"),
      eligibleSubmissionCount: number(row, "ELIGIBLE_SUBMISSION_COUNT"),
      answeredResponseCount: number(row, "ANSWERED_RESPONSE_COUNT"),
      missingResponseCount: number(row, "MISSING_RESPONSE_COUNT"),
      isSuppressed: boolean(row, "IS_SUPPRESSED"),
      adverseResponseCount: nullableNumber(row, "ADVERSE_RESPONSE_COUNT"),
      adverseResponseRate: nullableNumber(row, "ADVERSE_RESPONSE_RATE"),
      missingResponseRate: nullableNumber(row, "MISSING_RESPONSE_RATE"),
      previousAdverseResponseRate: nullableNumber(row, "PREVIOUS_ADVERSE_RESPONSE_RATE"),
      periodChangePp: nullableNumber(row, "PERIOD_CHANGE_PP"),
      trustAdverseResponseRate: nullableNumber(row, "TRUST_ADVERSE_RESPONSE_RATE"),
      trustGapPp: nullableNumber(row, "TRUST_GAP_PP"),
      coverageStatus: text(row, "COVERAGE_STATUS") as TrendRow["coverageStatus"],
      movementStatus: text(row, "MOVEMENT_STATUS") as TrendRow["movementStatus"]
    }));
  const distribution: DistributionRow[] = distributionRows.map((row) => ({
    answerValue: text(row, "ANSWER_VALUE"),
    answerDisplayOrder: number(row, "ANSWER_DISPLAY_ORDER"),
    isSuppressed: boolean(row, "IS_SUPPRESSED"),
    responseCount: nullableNumber(row, "RESPONSE_COUNT"),
    answeredResponseCount: number(row, "ANSWERED_RESPONSE_COUNT"),
    responseRate: nullableNumber(row, "RESPONSE_RATE")
  }));
  const categories: CategoryRow[] = categoryRows
    .filter((row) => selectedPeriods.has(text(row, "SURVEY_PERIOD")))
    .map((row) => ({
      schoolId: text(row, "SCHOOL_ID"),
      schoolClassification: nullableText(row, "SCHOOL_CLASSIFICATION"),
      surveyPeriod: text(row, "SURVEY_PERIOD"),
      categoryCode: text(row, "CATEGORY_CODE"),
      categoryLabel: text(row, "CATEGORY_LABEL"),
      eligibleSubmissionCount: number(row, "ELIGIBLE_SUBMISSION_COUNT"),
      indicatorCount: number(row, "INDICATOR_COUNT"),
      answeredQuestionResponseCount: number(row, "ANSWERED_QUESTION_RESPONSE_COUNT"),
      isSuppressed: boolean(row, "IS_SUPPRESSED"),
      adverseQuestionResponseRate: nullableNumber(row, "ADVERSE_QUESTION_RESPONSE_RATE"),
      missingQuestionResponseRate: nullableNumber(row, "MISSING_QUESTION_RESPONSE_RATE"),
      previousAdverseQuestionResponseRate: nullableNumber(row, "PREVIOUS_ADVERSE_QUESTION_RESPONSE_RATE"),
      periodChangePp: nullableNumber(row, "PERIOD_CHANGE_PP"),
      trustAdverseQuestionResponseRate: nullableNumber(row, "TRUST_ADVERSE_QUESTION_RESPONSE_RATE"),
      trustGapPp: nullableNumber(row, "TRUST_GAP_PP")
    }));
  const changeDrivers: ChangeDriverRow[] = driverRows.map((row) => ({
    schoolId: text(row, "SCHOOL_ID"),
    schoolClassification: nullableText(row, "SCHOOL_CLASSIFICATION"),
    surveyPeriod: text(row, "SURVEY_PERIOD"),
    categoryCode: text(row, "CATEGORY_CODE"),
    categoryLabel: text(row, "CATEGORY_LABEL"),
    questionCode: text(row, "QUESTION_CODE"),
    indicatorLabel: text(row, "INDICATOR_LABEL"),
    interpretationNote: text(row, "INTERPRETATION_NOTE"),
    eligibleSubmissionCount: number(row, "ELIGIBLE_SUBMISSION_COUNT"),
    isSuppressed: boolean(row, "IS_SUPPRESSED"),
    adverseResponseRate: nullableNumber(row, "ADVERSE_RESPONSE_RATE"),
    previousAdverseResponseRate: nullableNumber(row, "PREVIOUS_ADVERSE_RESPONSE_RATE"),
    indicatorChangePp: nullableNumber(row, "INDICATOR_CHANGE_PP"),
    categoryChangePp: nullableNumber(row, "CATEGORY_CHANGE_PP"),
    categoryChangeContributionPp: nullableNumber(row, "CATEGORY_CHANGE_CONTRIBUTION_PP"),
    driverRank: number(row, "DRIVER_RANK")
  }));
  const freshnessRow = freshnessRows[0];
  const freshness: Freshness | null = freshnessRow ? {
    lastLoadedAt: timestamp(freshnessRow, "LAST_LOADED_AT"),
    latestSourceUpdatedAt: timestamp(freshnessRow, "LATEST_SOURCE_UPDATED_AT"),
    logicalEventCount: number(freshnessRow, "LOGICAL_EVENT_COUNT")
  } : null;

  return { filters, selection, trend, distribution, categories, changeDrivers, freshness };
}
