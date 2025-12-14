import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = {
  region?: string;
  fiscal_month_anchor?: string; // YYYY-MM-DD
  show_components?: string; // "1" to show component columns in Regions table
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createClient(url, anon, { auth: { persistSession: false } });
}

function n(v: any): number | null {
  if (v === null || v === undefined) return null;
  const x = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(x) ? x : null;
}

function fmtPct(v: number | null, digits = 1) {
  if (v === null) return "—";
  return `${v.toFixed(digits)}%`;
}

function fmtNum(v: number | null, digits = 2) {
  if (v === null) return "—";
  return v.toFixed(digits);
}

function uniqNonEmpty(vals: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    set.add(s);
  }
  return Array.from(set);
}

function summarizeOneOrMany(vals: Array<string | null | undefined>) {
  const u = uniqNonEmpty(vals);
  if (u.length === 0) return "—";
  if (u.length === 1) return u[0];
  return `Multiple (${u.length})`;
}

/**
 * Metric mapping.
 *
 * - Rankings use per-tech values:
 *   tNPS Rate, FTR%, ToolUsage% (if present)
 *
 * - Region summary uses ratio-of-summed-components:
 *   tNPS: (ΣPromoters*100 + ΣDetractors*-100) / ΣSurveys
 *   FTR%: ((ΣTotal - ΣFail) / ΣTotal) * 100
 *   ToolUsage%: (ΣTUResult / ΣTUEligibleJobs) * 100
 */
type MetricCode =
  // per-tech values (Rankings)
  | "tnps"
  | "ftr"
  | "tool_usage"
  | "total_jobs"
  // tNPS components
  | "tnps_promoters"
  | "tnps_detractors"
  | "tnps_surveys"
  // FTR components
  | "ftr_fail_jobs"
  | "ftr_total_jobs"
  // Tool Usage components
  | "tu_result"
  | "tu_eligible";

const METRIC_MAP: Record<MetricCode, string[]> = {
  // per-tech values
  tnps: ["tNPS Rate", "tNPS", "TNPS", "tnps", "tnps rate"],
  ftr: ["FTR%", "FTR", "ftr%", "ftr"],
  tool_usage: ["ToolUsage", "Tool Usage"],
  total_jobs: ["Total Jobs", "TotalJobs"],

  // components
  tnps_promoters: ["Promoters"],
  tnps_detractors: ["Detractors"],
  tnps_surveys: ["tNPS Surveys"],

  ftr_fail_jobs: ["FTRFailJobs"],
  ftr_total_jobs: ["Total FTR/Contact Jobs"],

  tu_result: ["TUResult"],
  tu_eligible: ["TUEligibleJobs"],
};

function pickMetricCode(metricName: string): MetricCode | null {
  for (const [code, names] of Object.entries(METRIC_MAP) as any) {
    if ((names as string[]).includes(metricName)) return code as MetricCode;
  }
  return null;
}

type PivotRow = {
  tech_id: string;
  tech_name: string | null;
  supervisor: string | null; // ITG supervisor
  company: string | null;
  region: string | null;
  fiscal_month_anchor: string | null;

  total_jobs: number | null;
  tnps: number | null; // tNPS Rate (per-tech)
  ftr: number | null; // FTR% (per-tech)
  tool_usage: number | null; // ToolUsage% (per-tech if present)
};

type RegionAgg = {
  region: string;
  fiscal_month_anchor: string | null;

  headcount: number;
  total_jobs: number;

  // components
  promoters: number;
  detractors: number;
  surveys: number;

  ftr_fail_jobs: number;
  ftr_total_jobs: number;

  tu_result: number;
  tu_eligible: number;

  // computed
  tnps_region: number | null;
  ftr_region: number | null;
  tool_usage_region: number | null;
};

function computeTNPS(promoters: number, detractors: number, surveys: number): number | null {
  if (!surveys || surveys <= 0) return null;
  // (ΣPromoters*100 + ΣDetractors*-100) / ΣSurveys
  return promoters * 100 + detractors * -100 / surveys;
}

/**
 * NOTE:
 * Keep the formula exactly matching the Sheets logic:
 * tnps = ((promoters*100) + (detractors*-100)) / surveys
 */
function computeTNPS_Sheets(promoters: number, detractors: number, surveys: number): number | null {
  if (!surveys || surveys <= 0) return null;
  return (promoters * 100 + detractors * -100) / surveys;
}

function computeFTRPct(fail: number, total: number): number | null {
  if (!total || total <= 0) return null;
  return ((total - fail) / total) * 100;
}

function computeToolUsagePct(result: number, eligible: number): number | null {
  if (!eligible || eligible <= 0) return null;
  return (result / eligible) * 100;
}

export default async function MetricsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const sb = getSupabase();

  const showComponents = sp.show_components === "1";

  // only fetch the metric_name values we care about
  const neededMetricNames = Array.from(new Set(Object.values(METRIC_MAP).flat()));

  let q = sb
    .from("kpi_master_v1")
    .select("tech_id, tech_name, supervisor, company, region, fiscal_month_anchor, metric_name, metric_value_num")
    .in("metric_name", neededMetricNames);

  if (sp.region) q = q.eq("region", sp.region);
  if (sp.fiscal_month_anchor) q = q.eq("fiscal_month_anchor", sp.fiscal_month_anchor);

  const { data, error } = await q;

  if (error) {
    return (
      <main style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Metrics</h1>
        <p style={{ marginTop: 6, opacity: 0.85 }}>KPI report view (tNPS / FTR / ToolUsage)</p>

        <div style={{ marginTop: 18, padding: 16, border: "1px solid #f2c2c2", borderRadius: 14 }}>
          <div style={{ fontWeight: 950, marginBottom: 6 }}>Could not load KPI report</div>
          <div style={{ opacity: 0.9 }}>{error.message}</div>
          <div style={{ marginTop: 10, opacity: 0.85, fontSize: 12 }}>
            If this is an RLS error, ensure your UI role can read <code>kpi_master_v1</code>.
          </div>
        </div>
      </main>
    );
  }

  const rows = data ?? [];

  // ----------------------------
  // 1) Pivot into per-tech rows (Rankings)
  // ----------------------------
  const techMap = new Map<string, PivotRow>();

  for (const r of rows as any[]) {
    const tech_id = String(r.tech_id ?? "").trim();
    if (!tech_id) continue;

    const code = pickMetricCode(String(r.metric_name ?? ""));
    if (!code) continue;

    const existing =
      techMap.get(tech_id) ??
      ({
        tech_id,
        tech_name: r.tech_name ?? null,
        supervisor: r.supervisor ?? null,
        company: r.company ?? null,
        region: r.region ?? null,
        fiscal_month_anchor: r.fiscal_month_anchor ?? null,

        total_jobs: null,
        tnps: null,
        ftr: null,
        tool_usage: null,
      } as PivotRow);

    // prefer first non-null identity values
    existing.tech_name = existing.tech_name ?? r.tech_name ?? null;
    existing.supervisor = existing.supervisor ?? r.supervisor ?? null;
    existing.company = existing.company ?? r.company ?? null;
    existing.region = existing.region ?? r.region ?? null;
    existing.fiscal_month_anchor = existing.fiscal_month_anchor ?? r.fiscal_month_anchor ?? null;

    const v = n(r.metric_value_num);

    // only set if empty to avoid accidental overwrites
    if (code === "total_jobs" && existing.total_jobs === null) existing.total_jobs = v;
    if (code === "tnps" && existing.tnps === null) existing.tnps = v;
    if (code === "ftr" && existing.ftr === null) existing.ftr = v;
    if (code === "tool_usage" && existing.tool_usage === null) existing.tool_usage = v;

    techMap.set(tech_id, existing);
  }

  const pivot = Array.from(techMap.values());
  pivot.sort((a, b) => (n(b.total_jobs) ?? 0) - (n(a.total_jobs) ?? 0));

  // ----------------------------
  // 2) Region aggregation (ratio of summed components)
  // ----------------------------
  const regionMap = new Map<string, RegionAgg>();

  for (const r of rows as any[]) {
    const region = String(r.region ?? "").trim();
    if (!region) continue;

    const code = pickMetricCode(String(r.metric_name ?? ""));
    if (!code) continue;

    const value = n(r.metric_value_num) ?? 0;

    const agg =
      regionMap.get(region) ??
      ({
        region,
        fiscal_month_anchor: r.fiscal_month_anchor ?? null,
        headcount: 0,
        total_jobs: 0,

        promoters: 0,
        detractors: 0,
        surveys: 0,

        ftr_fail_jobs: 0,
        ftr_total_jobs: 0,

        tu_result: 0,
        tu_eligible: 0,

        tnps_region: null,
        ftr_region: null,
        tool_usage_region: null,
      } as RegionAgg);

    agg.fiscal_month_anchor = agg.fiscal_month_anchor ?? (r.fiscal_month_anchor ?? null);

    if (code === "total_jobs") agg.total_jobs += value;

    if (code === "tnps_promoters") agg.promoters += value;
    if (code === "tnps_detractors") agg.detractors += value;
    if (code === "tnps_surveys") agg.surveys += value;

    if (code === "ftr_fail_jobs") agg.ftr_fail_jobs += value;
    if (code === "ftr_total_jobs") agg.ftr_total_jobs += value;

    if (code === "tu_result") agg.tu_result += value;
    if (code === "tu_eligible") agg.tu_eligible += value;

    regionMap.set(region, agg);
  }

  // headcount from pivot (distinct techs per region)
  for (const t of pivot) {
    const region = String(t.region ?? "").trim();
    if (!region) continue;
    const agg = regionMap.get(region);
    if (!agg) continue;
    agg.headcount += 1;
  }

  const regionAggs = Array.from(regionMap.values()).map((a) => ({
    ...a,
    tnps_region: computeTNPS_Sheets(a.promoters, a.detractors, a.surveys),
    ftr_region: computeFTRPct(a.ftr_fail_jobs, a.ftr_total_jobs),
    tool_usage_region: computeToolUsagePct(a.tu_result, a.tu_eligible),
  }));

  regionAggs.sort((a, b) => b.total_jobs - a.total_jobs);

  // ----------------------------
  // 2.5) Roster lookup (Regional Manager + ITG Supervisor) for Regions grid
  // ----------------------------
  const techIdsForRoster = Array.from(
    new Set(pivot.map((p) => String(p.tech_id ?? "").trim()).filter(Boolean))
  );

  const rosterByTech = new Map<
  string,
  { rm_effective: string | null; director: string | null; itg_supervisor: string | null }
>();



  if (techIdsForRoster.length > 0) {
    const { data: rosterRows, error: rosterErr } = await sb
      .from("roster_v2")
      .select("tech_id, regional_ops_manager, pc_ops_manager, director, itg_supervisor, status")
      .eq("status", "Active")
      .in("tech_id", techIdsForRoster);

    // If RLS blocks this or any error occurs, we just won’t populate these labels.
    if (!rosterErr) {
      for (const rr of rosterRows ?? []) {
        const tid = String((rr as any).tech_id ?? "").trim();
        if (!tid) continue;
        const regional = String((rr as any).regional_ops_manager ?? "").trim() || null;
        const pc = String((rr as any).pc_ops_manager ?? "").trim() || null;
        const director = String((rr as any).director ?? "").trim() || null;

        rosterByTech.set(tid, {
        rm_effective: regional ?? pc,
        director,
        itg_supervisor: (rr as any).itg_supervisor ?? null,
      });


      }
    }
  }

  const regionRosterLabels = new Map<string, { rm: string; director: string; itg: string }>();

  for (const rg of regionAggs) {
    const techsInRegion = pivot
      .filter((p) => String(p.region ?? "").trim() === rg.region)
      .map((p) => String(p.tech_id ?? "").trim());

    const rms: Array<string | null> = [];
    const directors: Array<string | null> = [];
    const itgs: Array<string | null> = [];

    for (const tid of techsInRegion) {
      const rr = rosterByTech.get(tid);
      if (!rr) continue;
      rms.push(rr.rm_effective);
      directors.push(rr.director);
      itgs.push(rr.itg_supervisor);
    }

    regionRosterLabels.set(rg.region, {
      rm: summarizeOneOrMany(rms),
      director: summarizeOneOrMany(directors),
      itg: summarizeOneOrMany(itgs),
    });
  }

  // ----------------------------
  // Header values
  // ----------------------------
  const totalJobsAll = pivot.reduce((acc, r) => acc + (n(r.total_jobs) ?? 0), 0);
  const regionLabel = sp.region ?? (pivot[0]?.region ?? "—");
  const fiscalMonthLabel =
    sp.fiscal_month_anchor ??
    (pivot[0]?.fiscal_month_anchor ?? regionAggs[0]?.fiscal_month_anchor ?? "—");

  const baseQuery = sp.fiscal_month_anchor
    ? `?fiscal_month_anchor=${encodeURIComponent(sp.fiscal_month_anchor)}`
    : "";

  const componentsToggleHref = sp.region
    ? `/metrics?region=${encodeURIComponent(sp.region)}${
        sp.fiscal_month_anchor ? `&fiscal_month_anchor=${encodeURIComponent(sp.fiscal_month_anchor)}` : ""
      }&show_components=${showComponents ? "0" : "1"}`
    : `/metrics${
        sp.fiscal_month_anchor
          ? `?fiscal_month_anchor=${encodeURIComponent(sp.fiscal_month_anchor)}&show_components=${showComponents ? "0" : "1"}`
          : `?show_components=${showComponents ? "0" : "1"}`
      }`;

  return (
    <main style={{ padding: 40, maxWidth: 1200, margin
: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Metrics</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>KPI report view (tNPS / FTR / ToolUsage)</p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <a href="/" style={btnStyle}>Back</a>
          <a href="/metrics/upload" style={btnStyle}>Uploads →</a>
          <a href="/metrics/settings" style={btnStyle}>Settings</a>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14, opacity: 0.92 }}>
        <div style={{ fontWeight: 900 }}>Region: {String(regionLabel)}</div>
        <div style={{ fontWeight: 900 }}>Headcount: {pivot.length}</div>
        <div style={{ fontWeight: 900 }}>Job Count: {totalJobsAll.toLocaleString()}</div>
        <div style={{ fontWeight: 900 }}>Fiscal Month: {String(fiscalMonthLabel)}</div>

        <a href={componentsToggleHref} style={{ marginLeft: "auto", fontWeight: 900, textDecoration: "none" }}>
          {showComponents ? "Hide components" : "Show components"}
        </a>

        {sp.region ? (
          <a href={`/metrics${baseQuery}`} style={{ fontWeight: 900, textDecoration: "none" }}>
            View all regions →
          </a>
        ) : null}
      </div>

      {/* ✅ Regions grid aligned with Rankings metrics */}
      <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: 12, fontWeight: 950, borderBottom: "1px solid #ddd" }}>Regions</div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Region</th>
                <th style={th}>Director</th>
                <th style={th}>Regional Manager</th>
                <th style={th}>Headcount</th>

                {/* SAME KPI columns as Rankings */}
                <th style={th}>tNPS</th>
                <th style={th}>FTR%</th>
                <th style={th}>ToolUsage%</th>
                <th style={th}>Total Jobs</th>

                {showComponents ? (
                  <>
                    <th style={th}>Promoters</th>
                    <th style={th}>Detractors</th>
                    <th style={th}>Surveys</th>

                    <th style={th}>FTR Fail</th>
                    <th style={th}>FTR Total</th>

                    <th style={th}>TU Result</th>
                    <th style={th}>TU Eligible</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {regionAggs.map((rg) => (
                <tr key={rg.region}>
                  <td style={td}>
                    <a
                      href={`/metrics?region=${encodeURIComponent(rg.region)}${
                        sp.fiscal_month_anchor ? `&fiscal_month_anchor=${encodeURIComponent(sp.fiscal_month_anchor)}` : ""
                      }${showComponents ? `&show_components=1` : ""}`}
                      style={{ textDecoration: "none", fontWeight: 900 }}
                    >
                      {rg.region}
                    </a>
                  </td>

                  <td style={td}>{regionRosterLabels.get(rg.region)?.director ?? "—"}</td>
                  <td style={td}>{regionRosterLabels.get(rg.region)?.rm ?? "—"}</td>

                  <td style={tdRight}>{rg.headcount.toLocaleString()}</td>

                  {/* SAME KPI columns as Rankings */}
                  <td style={tdRight}>{fmtNum(rg.tnps_region, 2)}</td>
                  <td style={tdRight}>{fmtPct(rg.ftr_region, 1)}</td>
                  <td style={tdRight}>{fmtPct(rg.tool_usage_region, 2)}</td>
                  <td style={tdRight}>{rg.total_jobs.toLocaleString()}</td>

                  {showComponents ? (
                    <>
                      <td style={tdRight}>{rg.promoters.toLocaleString()}</td>
                      <td style={tdRight}>{rg.detractors.toLocaleString()}</td>
                      <td style={tdRight}>{rg.surveys.toLocaleString()}</td>

                      <td style={tdRight}>{rg.ftr_fail_jobs.toLocaleString()}</td>
                      <td style={tdRight}>{rg.ftr_total_jobs.toLocaleString()}</td>

                      <td style={tdRight}>{rg.tu_result.toLocaleString()}</td>
                      <td style={tdRight}>{rg.tu_eligible.toLocaleString()}</td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: 12, borderTop: "1px solid #ddd", fontSize: 12, opacity: 0.85 }}>
          Regions show the same KPI columns as Rankings. Metrics are computed from components (ratio of summed components), matching your Sheets logic.
        </div>
      </div>

      {/* Rankings */}
      <div style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: 12, fontWeight: 950, borderBottom: "1px solid #ddd" }}>
          Rankings{sp.region ? ` — ${sp.region}` : ""}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Tech ID</th>
                <th style={th}>Company</th>
                <th style={th}>Tech Name</th>
                <th style={th}>ITG Supervisor</th>

                {/* SAME KPI columns as Regions */}
                <th style={th}>tNPS</th>
                <th style={th}>FTR%</th>
                <th style={th}>ToolUsage%</th>
                <th style={th}>Total Jobs</th>
              </tr>
            </thead>
            <tbody>
              {pivot.map((r) => (
                <tr key={r.tech_id}>
                  <td style={td}>{r.tech_id}</td>
                  <td style={td}>{r.company ?? "—"}</td>
                  <td style={td}>{r.tech_name ?? "—"}</td>
                  <td style={td}>{r.supervisor ?? "—"}</td>

                  {/* SAME KPI columns as Regions */}
                  <td style={tdRight}>{fmtNum(r.tnps, 2)}</td>
                  <td style={tdRight}>{fmtPct(r.ftr, 1)}</td>
                  <td style={tdRight}>{fmtPct(r.tool_usage, 2)}</td>
                  <td style={tdRight}>{(n(r.total_jobs) ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: 12, borderTop: "1px solid #ddd", fontSize: 12, opacity: 0.85 }}>
          Rankings shows per-tech KPIs. Regions shows rolled-up KPIs using component formulas.
        </div>
      </div>
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #ddd",
  textDecoration: "none",
  fontWeight: 900,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
  opacity: 0.9,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const tdRight: React.CSSProperties = {
  ...td,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};
