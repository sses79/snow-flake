"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { displayLabel } from "@/lib/questions";
import type { CategoryRow, DashboardData, TrendRow } from "@/lib/types";

const COLORS = ["#ff6b4a", "#246b73", "#8e5bd9", "#d79b27", "#4e7a3f", "#b74770"];

function percentage(value: number | null): string {
  return value === null ? "Suppressed" : new Intl.NumberFormat("en-GB", {
    style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1
  }).format(value);
}

function percentagePoints(value: number | null): string {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)} pp`;
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", { notation: "compact" }).format(value);
}

function periodLabel(period: string): string {
  const [year, season] = period.split("_");
  return `${displayLabel(season)} ${year}`;
}

function latestBySchool<T extends { schoolId: string }>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) latest.set(row.schoolId, row);
  return [...latest.values()];
}

function movementClass(value: number | null): string {
  if (value === null) return "neutral";
  return value >= 1 ? "up" : value <= -1 ? "down" : "neutral";
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [schoolId, setSchoolId] = useState("");
  const [categoryCode, setCategoryCode] = useState("emotional_wellbeing");
  const [questionCode, setQuestionCode] = useState("sad_or_upset");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams();
    if (schoolId) parameters.set("schoolId", schoolId);
    if (categoryCode) parameters.set("categoryCode", categoryCode);
    if (questionCode) parameters.set("questionCode", questionCode);
    if (periodFrom) parameters.set("periodFrom", periodFrom);
    if (periodTo) parameters.set("periodTo", periodTo);
    setLoading(true);
    setError(null);
    fetch(`/api/dashboard?${parameters}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Dashboard request failed");
        return payload as DashboardData;
      })
      .then((payload) => {
        setData(payload);
        setCategoryCode(payload.selection.categoryCode);
        setQuestionCode(payload.selection.questionCode);
        setPeriodFrom(payload.selection.periodFrom);
        setPeriodTo(payload.selection.periodTo);
      })
      .catch((requestError: Error) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [schoolId, categoryCode, questionCode, periodFrom, periodTo]);

  const questions = data?.filters.questions.filter((question) => question.categoryCode === categoryCode) ?? [];
  const schools = useMemo(() => [...new Set(data?.trend.map((row) => row.schoolId) ?? [])], [data]);
  const chartData = useMemo(() => {
    const periods = new Map<string, Record<string, string | number | null>>();
    for (const row of data?.trend ?? []) {
      const point = periods.get(row.surveyPeriod) ?? { period: periodLabel(row.surveyPeriod) };
      point[row.schoolId] = row.adverseResponseRate;
      if (!("trustBenchmark" in point)) point.trustBenchmark = row.trustAdverseResponseRate;
      periods.set(row.surveyPeriod, point);
    }
    return [...periods.values()];
  }, [data]);
  const latestRows = useMemo(
    () => latestBySchool(data?.trend ?? []).sort((left, right) => (right.periodChangePp ?? -999) - (left.periodChangePp ?? -999)),
    [data]
  );
  const latestCategories = useMemo(
    () => latestBySchool(data?.categories ?? []).sort((left, right) => (right.periodChangePp ?? -999) - (left.periodChangePp ?? -999)),
    [data]
  );
  const worsening = latestRows.filter((row) => row.movementStatus === "worsening");
  const aboveBenchmark = [...latestRows].filter((row) => row.trustGapPp !== null).sort((left, right) => right.trustGapPp! - left.trustGapPp!)[0];
  const answered = latestRows.reduce((sum, row) => sum + row.answeredResponseCount, 0);
  const limitedCoverage = latestRows.filter((row) => row.coverageStatus !== "adequate");
  const selectedQuestion = data?.filters.questions.find((question) => question.code === data.selection.questionCode);
  const exportParameters = new URLSearchParams({
    categoryCode, questionCode, periodFrom, periodTo, ...(schoolId ? { schoolId } : {})
  });

  function changeCategory(nextCategory: string) {
    setCategoryCode(nextCategory);
    const firstQuestion = data?.filters.questions.find((question) => question.categoryCode === nextCategory);
    if (firstQuestion) setQuestionCode(firstQuestion.code);
  }

  return (
    <main>
      <div className="synthetic-banner">Synthetic data <span>Demonstration only — no real pupils</span></div>
      <header className="page-header">
        <div>
          <p className="eyebrow">Wellbeing analysis workspace</p>
          <h1>See the change. Find the driver.</h1>
          <p className="lede">Compare fictional schools with their trust benchmark, follow changes between survey periods, and inspect the aggregate answers behind each signal.</p>
        </div>
        <div className="header-actions">
          <a className="export-button" href={`/api/export?${exportParameters}`}>Download aggregate CSV</a>
          <div className="freshness-card"><span className="status-dot" /><div><small>Warehouse data loaded</small><strong>{data?.freshness ? new Date(data.freshness.lastLoadedAt).toLocaleString("en-GB") : "Checking…"}</strong></div></div>
        </div>
      </header>

      <section className="filter-panel" aria-label="Dashboard filters">
        <label>Trust<select value={data?.filters.trustId ?? "trust_north"} disabled><option value="trust_north">North Trust</option><option value="trust_south">South Trust</option></select></label>
        <label>School<select value={schoolId} onChange={(event) => setSchoolId(event.target.value)}><option value="">All schools</option>{data?.filters.schools.map((school) => <option value={school.id} key={school.id}>{displayLabel(school.id)} · {school.classification ?? "Unclassified"}</option>)}</select></label>
        <label>Category<select value={categoryCode} onChange={(event) => changeCategory(event.target.value)}>{data?.filters.categories.map((category) => <option value={category.code} key={category.code}>{category.label}</option>)}</select></label>
        <label>Indicator<select value={questionCode} onChange={(event) => setQuestionCode(event.target.value)}>{questions.map((question) => <option value={question.code} key={question.code}>{question.label}</option>)}</select></label>
        <label>From<select value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)}>{data?.filters.periods.map((period) => <option value={period} key={period} disabled={data.filters.periods.indexOf(period) > data.filters.periods.indexOf(periodTo)}>{periodLabel(period)}</option>)}</select></label>
        <label>To<select value={periodTo} onChange={(event) => setPeriodTo(event.target.value)}>{data?.filters.periods.map((period) => <option value={period} key={period} disabled={data.filters.periods.indexOf(period) < data.filters.periods.indexOf(periodFrom)}>{periodLabel(period)}</option>)}</select></label>
      </section>

      {error && <div className="error-panel" role="alert"><strong>Could not load analytical data.</strong><span>{error}</span></div>}
      {!data && loading && <div className="loading-panel">Opening the suppression-safe analytical views…</div>}

      {data && <>
        {limitedCoverage.length > 0 && <div className="coverage-warning" role="status"><strong>Coverage note:</strong> {limitedCoverage.length} school result{limitedCoverage.length === 1 ? " is" : "s are"} limited or suppressed. Rates and numerators are hidden for cohorts below 10.</div>}

        <section className="metric-grid four" aria-label="Key analytical findings">
          <article className="metric-card coral"><span>Schools worsening</span><strong>{worsening.length}</strong><small>{worsening[0] ? `${displayLabel(worsening[0].schoolId)} leads at ${percentagePoints(worsening[0].periodChangePp)}` : "No ≥1 pp increase"}</small></article>
          <article className="metric-card teal"><span>Largest trust gap</span><strong>{percentagePoints(aboveBenchmark?.trustGapPp ?? null)}</strong><small>{aboveBenchmark ? displayLabel(aboveBenchmark.schoolId) : "No benchmark available"}</small></article>
          <article className="metric-card cream"><span>Answered responses</span><strong>{compactNumber(answered)}</strong><small>selected indicator, latest period</small></article>
          <article className="metric-card lavender"><span>Coverage warnings</span><strong>{limitedCoverage.length}</strong><small>missingness ≥20% or cohort &lt;10</small></article>
        </section>

        <section className="analyst-note">
          <div><p className="eyebrow">Metric definition</p><strong>{selectedQuestion?.label}</strong></div>
          <p>{selectedQuestion?.interpretationNote} “Worsening” means the adverse-response rate rose by at least 1 percentage point; it is not a significance test.</p>
        </section>

        <section className="content-grid">
          <article className="panel trend-panel">
            <div className="panel-heading"><div><p className="eyebrow">Indicator over time</p><h2>{selectedQuestion?.label}</h2></div><span className="loading-state">{loading ? "Updating…" : "Dashed line = trust benchmark"}</span></div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 15, right: 20, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke="#dce4df" vertical={false} />
                  <XAxis dataKey="period" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} tickLine={false} axisLine={false} width={45} />
                  <Tooltip formatter={(value) => percentage(value === null ? null : Number(value))} contentStyle={{ borderRadius: 12, border: "1px solid #dce4df" }} />
                  <Legend />
                  {schools.map((school, index) => <Line connectNulls={false} key={school} type="monotone" dataKey={school} name={displayLabel(school)} stroke={COLORS[index % COLORS.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />)}
                  <Line connectNulls={false} type="monotone" dataKey="trustBenchmark" name="Trust benchmark" stroke="#63716d" strokeDasharray="7 5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <aside className="panel ranking-panel">
            <div className="panel-heading"><div><p className="eyebrow">Latest comparison</p><h2>School ranking</h2></div></div>
            <div className="ranking-list">
              {latestRows.map((row, index) => <button key={row.schoolId} className="ranking-row" onClick={() => setSchoolId(row.schoolId)}>
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span><strong>{displayLabel(row.schoolId)}</strong><small>{percentage(row.adverseResponseRate)} current · {percentagePoints(row.trustGapPp)} vs trust</small></span>
                <span className={`change ${movementClass(row.periodChangePp)}`}>{percentagePoints(row.periodChangePp)}</span>
              </button>)}
            </div>
          </aside>
        </section>

        <section className="content-grid equal-grid">
          <article className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Category context</p><h2>{data.filters.categories.find((category) => category.code === categoryCode)?.label}</h2></div><span>Weighted question responses</span></div>
            <div className="table-wrap category-table"><table><thead><tr><th>School</th><th>Current</th><th>Change</th><th>Trust gap</th><th>Missing</th></tr></thead><tbody>{latestCategories.map((row: CategoryRow) => <tr key={row.schoolId} onClick={() => setSchoolId(row.schoolId)}><td>{displayLabel(row.schoolId)}</td><td>{percentage(row.adverseQuestionResponseRate)}</td><td><span className={`inline-change ${movementClass(row.periodChangePp)}`}>{percentagePoints(row.periodChangePp)}</span></td><td>{percentagePoints(row.trustGapPp)}</td><td>{percentage(row.missingQuestionResponseRate)}</td></tr>)}</tbody></table></div>
            <p className="fine-print">Category rates are the share of answered question responses classified as adverse. They are not pupil prevalence or an overall wellbeing score.</p>
          </article>

          <article className="panel driver-panel">
            <div className="panel-heading"><div><p className="eyebrow">Why the category moved</p><h2>Question drivers</h2></div><span>{periodLabel(data.selection.detailPeriod)}</span></div>
            <div className="driver-list">{data.changeDrivers.slice(0, 10).map((driver) => <button key={`${driver.schoolId}-${driver.questionCode}`} onClick={() => { setSchoolId(driver.schoolId); setQuestionCode(driver.questionCode); }}>
              <span><strong>{driver.indicatorLabel}</strong><small>{displayLabel(driver.schoolId)} · {percentage(driver.adverseResponseRate)}</small></span>
              <span className={`driver-value ${movementClass(driver.categoryChangeContributionPp)}`}>{percentagePoints(driver.categoryChangeContributionPp)}<small>contribution</small></span>
            </button>)}</div>
          </article>
        </section>

        <section className="panel distribution-panel">
          <div className="panel-heading"><div><p className="eyebrow">Evidence behind the indicator</p><h2>Ordered response distribution</h2></div><span>{periodLabel(data.selection.detailPeriod)}</span></div>
          {data.distribution.some((row) => row.isSuppressed) ? <div className="suppressed-panel">This distribution is suppressed because the selected cohort contains fewer than 10 submissions.</div> : <div className="chart-wrap short"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.distribution} margin={{ left: 12, right: 20 }}><CartesianGrid strokeDasharray="4 6" stroke="#dce4df" vertical={false} /><XAxis dataKey="answerValue" tickLine={false} axisLine={false} /><YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} tickLine={false} axisLine={false} width={45} /><Tooltip formatter={(value) => percentage(value === null ? null : Number(value))} /><ReferenceLine y={0} stroke="#17352f" /><Bar dataKey="responseRate" name="Share of answers" fill="#246b73" radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div>}
          <p className="disclaimer"><strong>Non-diagnostic:</strong> These product rules summarise aggregate survey answer patterns. They do not identify a condition, determine individual need, or replace safeguarding and professional judgement.</p>
        </section>
      </>}
    </main>
  );
}
