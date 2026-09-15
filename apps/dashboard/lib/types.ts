export type QuestionOption = {
  code: string;
  label: string;
  categoryCode: string;
  categoryLabel: string;
  interpretationNote: string;
};

export type DashboardFilters = {
  trustId: string;
  schools: Array<{ id: string; classification: string | null }>;
  periods: string[];
  categories: Array<{ code: string; label: string }>;
  questions: QuestionOption[];
};

export type TrendRow = {
  schoolId: string;
  schoolClassification: string | null;
  surveyPeriod: string;
  questionCode: string;
  indicatorLabel: string;
  categoryCode: string;
  categoryLabel: string;
  interpretationNote: string;
  eligibleSubmissionCount: number;
  answeredResponseCount: number;
  missingResponseCount: number;
  isSuppressed: boolean;
  adverseResponseCount: number | null;
  adverseResponseRate: number | null;
  missingResponseRate: number | null;
  previousAdverseResponseRate: number | null;
  periodChangePp: number | null;
  trustAdverseResponseRate: number | null;
  trustGapPp: number | null;
  coverageStatus: "adequate" | "limited" | "suppressed";
  movementStatus: "no_comparison" | "worsening" | "improving" | "stable";
};

export type DistributionRow = {
  answerValue: string;
  answerDisplayOrder: number;
  isSuppressed: boolean;
  responseCount: number | null;
  answeredResponseCount: number;
  responseRate: number | null;
};

export type CategoryRow = {
  schoolId: string;
  schoolClassification: string | null;
  surveyPeriod: string;
  categoryCode: string;
  categoryLabel: string;
  eligibleSubmissionCount: number;
  indicatorCount: number;
  answeredQuestionResponseCount: number;
  isSuppressed: boolean;
  adverseQuestionResponseRate: number | null;
  missingQuestionResponseRate: number | null;
  previousAdverseQuestionResponseRate: number | null;
  periodChangePp: number | null;
  trustAdverseQuestionResponseRate: number | null;
  trustGapPp: number | null;
};

export type ChangeDriverRow = {
  schoolId: string;
  schoolClassification: string | null;
  surveyPeriod: string;
  categoryCode: string;
  categoryLabel: string;
  questionCode: string;
  indicatorLabel: string;
  interpretationNote: string;
  eligibleSubmissionCount: number;
  isSuppressed: boolean;
  adverseResponseRate: number | null;
  previousAdverseResponseRate: number | null;
  indicatorChangePp: number | null;
  categoryChangePp: number | null;
  categoryChangeContributionPp: number | null;
  driverRank: number;
};

export type Freshness = {
  lastLoadedAt: string;
  latestSourceUpdatedAt: string;
  logicalEventCount: number;
};

export type DashboardData = {
  filters: DashboardFilters;
  selection: {
    schoolId: string | null;
    categoryCode: string;
    questionCode: string;
    periodFrom: string;
    periodTo: string;
    detailPeriod: string;
  };
  trend: TrendRow[];
  distribution: DistributionRow[];
  categories: CategoryRow[];
  changeDrivers: ChangeDriverRow[];
  freshness: Freshness | null;
};
