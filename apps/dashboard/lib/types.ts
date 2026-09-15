export type DashboardFilters = {
  trustId: string;
  schools: Array<{ id: string; classification: string | null }>;
  periods: string[];
  questions: string[];
};

export type TrendRow = {
  schoolId: string;
  schoolClassification: string | null;
  surveyPeriod: string;
  questionCode: string;
  eligibleSubmissionCount: number;
  answeredResponseCount: number;
  adverseResponseCount: number;
  adverseResponseRate: number;
  previousAdverseResponseRate: number | null;
  periodChange: number | null;
};

export type DistributionRow = {
  answerValue: string;
  responseCount: number;
  answeredResponseCount: number;
  responseRate: number;
};

export type SupportSignalRow = {
  schoolId: string;
  schoolClassification: string | null;
  surveyPeriod: string;
  category: string;
  questionCode: string;
  answeredResponseCount: number;
  adverseResponseCount: number;
  adverseResponseRate: number;
  productSignalLevel: "lower" | "watch" | "elevated";
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
    questionCode: string;
    periodFrom: string;
    periodTo: string;
    detailPeriod: string;
  };
  trend: TrendRow[];
  distribution: DistributionRow[];
  supportSignals: SupportSignalRow[];
  freshness: Freshness | null;
};
