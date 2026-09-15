export type DashboardTenant = "trust_north" | "trust_south";

export type TenantConfig = {
  id: DashboardTenant;
  label: string;
  role: string;
  views: {
    trend: string;
    distribution: string;
    supportSignals: string;
    freshness: string;
    indicatorAnalysis: string;
    categoryAnalysis: string;
    changeDrivers: string;
  };
};

const DATABASE = "SCHOOL_WELLBEING_DEMO.MARTS";

const TENANTS: Record<DashboardTenant, TenantConfig> = {
  trust_north: {
    id: "trust_north",
    label: "North Trust",
    role: "WELLBEING_DEMO_TRUST_NORTH_READER",
    views: {
      trend: `${DATABASE}.MART_TRUST_NORTH_SCHOOL_WELLBEING_TREND`,
      distribution: `${DATABASE}.MART_TRUST_NORTH_QUESTION_RESPONSE_DISTRIBUTION`,
      supportSignals: `${DATABASE}.MART_TRUST_NORTH_SUPPORT_SIGNAL_SUMMARY`,
      freshness: `${DATABASE}.MART_TRUST_NORTH_DATA_FRESHNESS`,
      indicatorAnalysis: `${DATABASE}.MART_TRUST_NORTH_SCHOOL_INDICATOR_ANALYSIS`,
      categoryAnalysis: `${DATABASE}.MART_TRUST_NORTH_SCHOOL_CATEGORY_ANALYSIS`,
      changeDrivers: `${DATABASE}.MART_TRUST_NORTH_SCHOOL_CHANGE_DRIVERS`
    }
  },
  trust_south: {
    id: "trust_south",
    label: "South Trust",
    role: "WELLBEING_DEMO_TRUST_SOUTH_READER",
    views: {
      trend: `${DATABASE}.MART_TRUST_SOUTH_SCHOOL_WELLBEING_TREND`,
      distribution: `${DATABASE}.MART_TRUST_SOUTH_QUESTION_RESPONSE_DISTRIBUTION`,
      supportSignals: `${DATABASE}.MART_TRUST_SOUTH_SUPPORT_SIGNAL_SUMMARY`,
      freshness: `${DATABASE}.MART_TRUST_SOUTH_DATA_FRESHNESS`,
      indicatorAnalysis: `${DATABASE}.MART_TRUST_SOUTH_SCHOOL_INDICATOR_ANALYSIS`,
      categoryAnalysis: `${DATABASE}.MART_TRUST_SOUTH_SCHOOL_CATEGORY_ANALYSIS`,
      changeDrivers: `${DATABASE}.MART_TRUST_SOUTH_SCHOOL_CHANGE_DRIVERS`
    }
  }
};

export function getTenantConfig(value = process.env.DASHBOARD_TENANT): TenantConfig {
  const tenant = value ?? "trust_north";
  if (tenant !== "trust_north" && tenant !== "trust_south") {
    throw new Error("DASHBOARD_TENANT must be trust_north or trust_south");
  }
  return TENANTS[tenant];
}
