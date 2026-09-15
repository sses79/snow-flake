"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { displayLabel, questionLabel } from "@/lib/questions";
import type { DashboardData, TrendRow } from "@/lib/types";

const COLORS = ["#ff6b4a", "#246b73", "#8e5bd9", "#d79b27", "#4e7a3f", "#b74770"];

function percentage(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value);
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", { notation: "compact" }).format(value);
}

function periodLabel(period: string): string {
  const [year, season] = period.split("_");
  return `${displayLabel(season)} ${year}`;
}

function latestBySchool(rows: TrendRow[]): TrendRow[] {
  const latest = new Map<string, TrendRow>();
  for (const row of rows) latest.set(row.schoolId, row);
  return [...latest.values()].sort((left, right) => (right.periodChange ?? -1) - (left.periodChange ?? -1));
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [schoolId, setSchoolId] = useState("");
  const [questionCode, setQuestionCode] = useState("happy");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams();
    if (schoolId) parameters.set("schoolId", schoolId);
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
  }, [schoolId, questionCode, periodFrom, periodTo]);

  const schools = useMemo(() => [...new Set(data?.trend.map((row) => row.schoolId) ?? [])], [data]);
  const chartData = useMemo(() => {
    const periods = new Map<string, Record<string, string | number>>();
    for (const row of data?.trend ?? []) {
      const point = periods.get(row.surveyPeriod) ?? { period: periodLabel(row.surveyPeriod) };
      point[row.schoolId] = row.adverseResponseRate;
      periods.set(row.surveyPeriod, point);
    }
    return [...periods.values()];
  }, [data]);
  const latestRows = useMemo(() => latestBySchool(data?.trend ?? []), [data]);
  const worsening = latestRows.filter((row) => (row.periodChange ?? 0) > 0);
  const answered = latestRows.reduce((sum, row) => sum + row.answeredResponseCount, 0);

  return (
    <main>
      <div className="synthetic-banner">Synthetic data <span>Demonstration only — no real pupils</span></div>
      <header className="page-header">
        <div>
          <p className="eyebrow">Wellbeing intelligence</p>
          <h1>School signals, made visible.</h1>
          <p className="lede">Explore aggregate patterns, find changes between survey periods, and decide where a conversation may be useful.</p>
        </div>
        <div className="freshness-card">
          <span className="status-dot" />
          <div>
            <small>Warehouse data loaded</small>
            <strong>{data?.freshness ? new Date(data.freshness.lastLoadedAt).toLocaleString("en-GB") : "Checking…"}</strong>
          </div>
        </div>
      </header>

      <section className="filter-panel" aria-label="Dashboard filters">
        <label>Trust<select value={data?.filters.trustId ?? "trust_north"} disabled><option value="trust_north">North Trust</option><option value="trust_south">South Trust</option></select></label>
        <label>School<select value={schoolId} onChange={(event) => setSchoolId(event.target.value)}><option value="">All schools</option>{data?.filters.schools.map((school) => <option value={school.id} key={school.id}>{displayLabel(school.id)} · {school.classification ?? "Unclassified"}</option>)}</select></label>
        <label>Wellbeing indicator<select value={questionCode} onChange={(event) => setQuestionCode(event.target.value)}>{data?.filters.questions.map((question) => <option value={question} key={question}>{questionLabel(question)}</option>)}</select></label>
        <label>From<select value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)}>{data?.filters.periods.map((period) => <option value={period} key={period} disabled={data.filters.periods.indexOf(period) > data.filters.periods.indexOf(periodTo)}>{periodLabel(period)}</option>)}</select></label>
        <label>To<select value={periodTo} onChange={(event) => setPeriodTo(event.target.value)}>{data?.filters.periods.map((period) => <option value={period} key={period} disabled={data.filters.periods.indexOf(period) < data.filters.periods.indexOf(periodFrom)}>{periodLabel(period)}</option>)}</select></label>
      </section>

      {error && <div className="error-panel" role="alert"><strong>Could not load dashboard data.</strong><span>{error}</span></div>}
      {!data && loading && <div className="loading-panel">Opening the aggregate wellbeing view…</div>}

      {data && <>
        <section className="metric-grid" aria-label="Key indicators">
          <article className="metric-card coral"><span>Schools worsening</span><strong>{worsening.length}</strong><small>of {latestRows.length} in the latest comparison</small></article>
          <article className="metric-card teal"><span>Largest increase</span><strong>{percentage(worsening[0]?.periodChange ?? null)}</strong><small>{worsening[0] ? displayLabel(worsening[0].schoolId) : "No worsening signal"}</small></article>
          <article className="metric-card cream"><span>Responses in view</span><strong>{compactNumber(answered)}</strong><small>answered responses, latest period</small></article>
        </section>

        <section className="content-grid">
          <article className="panel trend-panel">
            <div className="panel-heading"><div><p className="eyebrow">Change over time</p><h2>{questionLabel(data.selection.questionCode)}</h2></div><span className="loading-state">{loading ? "Updating…" : periodLabel(data.selection.detailPeriod)}</span></div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 15, right: 20, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke="#dce4df" vertical={false} />
                  <XAxis dataKey="period" tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(value) => `${Math.round(value * 100)}%`} tickLine={false} axisLine={false} width={45} />
                  <Tooltip formatter={(value) => percentage(Number(value))} contentStyle={{ borderRadius: 12, border: "1px solid #dce4df" }} />
                  <Legend />
                  {schools.map((school, index) => <Line key={school} type="monotone" dataKey={school} name={displayLabel(school)} stroke={COLORS[index % COLORS.length]} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <aside className="panel attention-panel">
            <div className="panel-heading"><div><p className="eyebrow">Where to look</p><h2>Latest movement</h2></div></div>
            <div className="attention-list">
              {latestRows.map((row, index) => <button key={row.schoolId} className="attention-row" onClick={() => setSchoolId(row.schoolId)}>
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <span><strong>{displayLabel(row.schoolId)}</strong><small>{row.schoolClassification ?? "School"}</small></span>
                <span className={(row.periodChange ?? 0) > 0 ? "change up" : "change down"}>{row.periodChange === null ? "new" : `${row.periodChange > 0 ? "+" : ""}${percentage(row.periodChange)}`}</span>
              </button>)}
            </div>
          </aside>
        </section>

        <section className="content-grid lower-grid">
          <article className="panel distribution-panel">
            <div className="panel-heading"><div><p className="eyebrow">What respondents selected</p><h2>Response distribution</h2></div><span>{periodLabel(data.selection.detailPeriod)}</span></div>
            <div className="chart-wrap short">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.distribution} layout="vertical" margin={{ left: 20, right: 25 }}>
                  <CartesianGrid strokeDasharray="4 6" stroke="#dce4df" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => `${Math.round(value * 100)}%`} tickLine={false} axisLine={false} />
                  <YAxis dataKey="answerValue" type="category" width={94} tickLine={false} axisLine={false} tickFormatter={displayLabel} />
                  <Tooltip formatter={(value) => percentage(Number(value))} />
                  <Bar dataKey="responseRate" name="Share of answers" fill="#246b73" radius={[0, 7, 7, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="panel support-panel">
            <div className="panel-heading"><div><p className="eyebrow">Aggregate support signals</p><h2>Conversation starters</h2></div><span>{data.supportSignals.length} signals</span></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>School</th><th>Signal</th><th>Category</th><th>Rate</th><th>Level</th></tr></thead>
                <tbody>{data.supportSignals.slice(0, 12).map((signal) => <tr key={`${signal.schoolId}-${signal.questionCode}`}>
                  <td>{displayLabel(signal.schoolId)}</td><td>{questionLabel(signal.questionCode)}</td><td>{displayLabel(signal.category)}</td><td>{percentage(signal.adverseResponseRate)}</td><td><span className={`pill ${signal.productSignalLevel}`}>{signal.productSignalLevel}</span></td>
                </tr>)}</tbody>
              </table>
            </div>
            <p className="disclaimer"><strong>Non-diagnostic:</strong> These product rules summarise survey answer patterns. They do not identify a condition, determine individual need, or replace safeguarding and professional judgement.</p>
          </article>
        </section>
      </>}
    </main>
  );
}
