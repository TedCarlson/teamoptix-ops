// app/smart/page.tsx
import React from "react";
import { createClient } from "@supabase/supabase-js";
import { UI, pillBase } from "@/lib/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** deterministic string compare (server + client) */
const COLLATOR = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });

/** =========================================================
 *  PAGE-SPECIFIC UI (layout-only)
 *  Shared UI primitives come from /lib/ui.ts
 *  ========================================================= */
const PAGE = {
  padding: 24,
  maxWidth: 1400,
  sectionRadius: 14,
  border: "1px solid #ddd",
  divider: "1px solid #ddd",
};

const SURFACE_BG = "var(--app-surface, rgba(0,0,0,0.92))";

const headerCell: React.CSSProperties = {
  padding: "10px 10px",
  fontSize: 11,
  opacity: 0.75,
  fontWeight: 700,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  background: "inherit",
};

const bodyCell: React.CSSProperties = {
  padding: "10px 10px",
  fontSize: 13,
  whiteSpace: "nowrap",
  background: "inherit",
};

const stickyHeaderCell: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 3,
  background: SURFACE_BG,
};

const stickyBodyCell: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  background: SURFACE_BG,
};

function exportUrl(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return `/api/smart/export?${qs}`;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL fallback)");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, { auth: { persistSession: false } });
}

function n(v: any): number | null {
  if (v === null || v === undefined) return null;
  const x = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(x) ? x : null;
}

function fmtPctRatio(v: number | null, digits = 1) {
  if (v === null) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
function fmtNum(v: number | null, digits = 2) {
  if (v === null) return "—";
  return v.toFixed(digits);
}

function uniq(vals: string[]) {
  return Array.from(new Set(vals));
}
function latestMonth(rows: any[]) {
  const months = uniq(rows.map((r) => String(r.fiscal_month_anchor ?? "")).filter(Boolean));
  months.sort(); // YYYY-MM-DD sorts naturally
  return months[months.length - 1] ?? "";
}

const NF = new Intl.NumberFormat("en-US");
function fmtInt(v: number | null) {
  if (v === null) return "—";
  return NF.format(v);
}

type RankRow = {
  fiscal_month_anchor: string;
  level: string;
  rank_scope: string;

  display_name: string | null;
  level_key: string;

  division_id: string | null;
  division_name: string | null;

  region_id: string | null;
  region_name: string | null;

  company_code: string | null;

  itg_supervisor: string | null;
  supervisor: string | null;
  tech_id: string | null;
  tech_key: string | null;

  headcount: number | null;
  total_jobs: number | null;

  tnps: number | null; // tnps_rate number (0..100)
  ftr: number | null; // ratio (0..1)
  tool_usage: number | null; // ratio (0..1)

  rank_overall: number | null;
  weighted_score: number | null;
};

type SettingRow = {
  scope: string;
  metric_name: string;
  label: string | null;
  kpi_name: string | null;
  enabled: boolean;
  weight: number;
  sort_order: number;
  format: "number" | "percent" | null;
  hidden: boolean | null;
};

type Col = {
  key: string;
  label: string;
  right?: boolean;
  sticky?: boolean;
  hidden?: boolean;
  render?: (row: RankRow) => React.ReactNode;
};

// One source of truth for column widths
const COL_W: Record<string, string> = {
  display_name: "160px",
  __tech: "260px",

  __vp: "160px",
  __director: "260px",
  __rm: "240px",
  region_name: "160px",

  itg_supervisor: "200px",
  supervisor: "200px",
  company_code: "140px",

  rank_overall: "120px",
  headcount: "120px",
  tnps: "120px",
  ftr: "120px",
  tool_usage: "140px",
  total_jobs: "130px",
  __factor: "150px",
};

function gridTemplate(columns: Col[]) {
  const fallback = "120px";
  return columns
    .map((c) => {
      if (c.hidden) return "0px";
      return COL_W[c.key] ?? fallback;
    })
    .join(" ");
}

/** deterministic param helpers */
function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}
function s(v: any) {
  return String(v ?? "").trim();
}
function normKey(x: any) {
  return String(x ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
/** canonical org label normalizer (division/region matching) */
function normOrgLabel(x: any) {
  return String(x ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** -------------------------------------------------------
 *  Render safety (no table tags in grid cells)
 *  ------------------------------------------------------*/
const DISALLOWED_TABLE_TAGS = new Set(["table", "thead", "tbody", "tr", "td", "th"]);

function containsDisallowedTableTags(node: React.ReactNode): boolean {
  let found = false;

  const walk = (n0: React.ReactNode) => {
    if (found || n0 === null || n0 === undefined || typeof n0 === "boolean") return;

    if (Array.isArray(n0)) {
      for (const child of n0) walk(child);
      return;
    }

    if (React.isValidElement(n0)) {
      if (typeof n0.type === "string" && DISALLOWED_TABLE_TAGS.has(n0.type)) {
        found = true;
        return;
      }
      walk((n0.props as any)?.children);
      return;
    }
  };

  walk(node);
  return found;
}

function unwrapTd(node: React.ReactNode): React.ReactNode {
  if (React.isValidElement(node) && typeof node.type === "string" && node.type === "td") {
    return (node.props as any)?.children;
  }
  return node;
}

type CellNode = Exclude<React.ReactNode, undefined>;

function isSafeElementType(t: any) {
  return typeof t === "string" || t === React.Fragment;
}

function sanitizeCellNode(node: React.ReactNode): CellNode {
  if (node === null || node === undefined || typeof node === "boolean") return "—";

  if (Array.isArray(node)) {
    const out = node.map(sanitizeCellNode);
    const nonDash = out.filter((x) => x !== "—");
    return nonDash.length ? out : "—";
  }

  if (React.isValidElement(node)) {
    if (!isSafeElementType(node.type)) return "—";
    if (typeof node.type === "string" && DISALLOWED_TABLE_TAGS.has(node.type)) return "—";

    const kids = (node.props as any)?.children;
    if (kids && containsDisallowedTableTags(kids)) return "—";

    return node as CellNode;
  }

  return node as CellNode;
}

function Section({
  title,
  subtitle,
  rows,
  columns,
  actions,
  controls,
}: {
  title: string;
  subtitle?: React.ReactNode;
  rows: RankRow[];
  columns: Col[];
  actions?: React.ReactNode;
  controls?: React.ReactNode;
}) {
  const gridCols = gridTemplate(columns);

  return (
    <section style={{ marginTop: 16, border: PAGE.border, borderRadius: PAGE.sectionRadius, overflow: "hidden" }}>
      <div
        style={{
          padding: 12,
          borderBottom: PAGE.divider,
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontWeight: 950 }}>{title}</div>
          {subtitle ? <div style={{ opacity: 0.8, fontSize: UI.fontSize.small }}>{subtitle}</div> : null}
          {controls ? <div style={{ marginTop: 6 }}>{controls}</div> : null}
        </div>

        {actions ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>
        ) : null}
      </div>

      <div style={{ overflowX: "auto" }}>
        <div
          style={{
            maxHeight: 10 * 42 + 44,
            minHeight: 44 + 42 * 3,
            overflowY: "auto",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: gridCols,
              minWidth: "max-content",
              borderBottom: "1px solid #bbb",
              position: "sticky",
              top: 0,
              zIndex: 5,
              background: SURFACE_BG,
            }}
          >
            {columns.map((c) => (
              <div
                key={c.key}
                style={{
                  ...headerCell,
                  ...(c.right ? { textAlign: "right" } : null),
                  ...(c.sticky ? stickyHeaderCell : null),
                }}
              >
                {c.label}
              </div>
            ))}
          </div>

          {/* Body */}
          <div style={{ minWidth: "max-content" }}>
            {rows.map((r, idx) => {
              const primaryId =
                s((r as any).batch_id) ||
                (s(r.level) === "tech" ? s(r.tech_key || r.tech_id) : "") ||
                s(r.level_key) ||
                s(r.display_name);

              const rowKey = [
                s(r.fiscal_month_anchor),
                s(r.rank_scope),
                s(r.level),
                primaryId,
                s(r.division_id),
                s(r.region_id),
                s(r.company_code),
                String(idx),
              ]
                .filter(Boolean)
                .join("|");

              return (
                <div
                  key={rowKey}
                  style={{
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    minWidth: "max-content",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  {columns.map((c) => {
                    let raw: React.ReactNode = c.render ? c.render(r) : (r as any)[c.key];
                    raw = unwrapTd(raw);
                    if (containsDisallowedTableTags(raw)) raw = "—";
                    const val: CellNode = sanitizeCellNode(raw);

                    return (
                      <div
                        key={c.key}
                        style={{
                          ...bodyCell,
                          ...(c.right ? { textAlign: "right", fontVariantNumeric: "tabular-nums" } : null),
                          ...(c.sticky ? stickyBodyCell : null),
                          ...(c.sticky ? { fontWeight: 900 } : null),
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{val}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {rows.length === 0 ? <div style={{ padding: 12, opacity: 0.7 }}>No rows found.</div> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

/** =========================================================
 *  Small UI helpers
 *  ========================================================= */
function navBtnStyle(extra?: React.CSSProperties): React.CSSProperties {
  return pillBase({
    padding: "10px 14px",
    borderRadius: 12,
    fontWeight: UI.fontWeight.strong,
    textDecoration: "none",
    color: "inherit",
    ...extra,
  });
}

function chipBtnStyle(selected: boolean, extra?: React.CSSProperties): React.CSSProperties {
  return pillBase({
    cursor: "pointer",
    userSelect: "none",
    color: "inherit",
    background: "transparent",
    fontWeight: UI.fontWeight.strong,
    boxShadow: selected ? "inset 0 0 0 999px rgba(255,255,255,0.12)" : "none",
    ...extra,
  });
}

function tagPillStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    display: "block",
    padding: 0,
    margin: 0,
    border: "none",
    borderRadius: 0,
    background: "transparent",
    fontWeight: UI.fontWeight.normal,
    fontSize: 13,
    lineHeight: "18px",
    opacity: 0.95,
    whiteSpace: "nowrap",
    ...extra,
  };
}

/** =========================================================
 *  Settings → Grid wiring
 *  ========================================================= */
type CanonKey = "tnps" | "ftr" | "tool_usage" | "total_jobs" | "headcount";

const METRIC_ALIASES: Record<CanonKey, string[]> = {
  tnps: ["tnps", "tnpsrate", "tnps_rate", "tnpsratepct", "tnpssurveys", "promoters", "detractors"],
  ftr: ["ftr", "ftrpct", "ftrpercent", "totalftrcontactjobs", "ftrfailjobs"],
  tool_usage: ["tool_usage", "toolusage", "toolusagepct", "turesult", "tueligiblejobs"],
  total_jobs: ["total_jobs", "totaljobs", "total jobs"],
  headcount: ["headcount", "hc"],
};

const DISPLAY_ALIASES: Record<CanonKey, string[]> = {
  tnps: ["tnps", "tnpsrate", "tnps rate", "tnpsrate%"],
  ftr: ["ftr", "ftr%", "ftrpct"],
  tool_usage: ["tool_usage", "toolusage", "toolusage%", "toolusagepct"],
  total_jobs: ["total_jobs", "totaljobs", "total jobs"],
  headcount: ["headcount", "hc"],
};

function buildSettingsIndex(rows: SettingRow[]) {
  const byNorm = new Map<string, SettingRow>();
  for (const r of rows) {
    const k = normKey(r.metric_name);
    if (k) byNorm.set(k, r);
  }

  function findSetting(canon: CanonKey): SettingRow | null {
    const direct = byNorm.get(normKey(canon));
    if (direct) return direct;

    for (const a of DISPLAY_ALIASES[canon] ?? []) {
      const hit = byNorm.get(normKey(a));
      if (hit) return hit;
    }

    for (const a of METRIC_ALIASES[canon] ?? []) {
      const hit = byNorm.get(normKey(a));
      if (hit) return hit;
    }

    return null;
  }

  function isOn(canon: CanonKey, fallbackOn = true) {
    const row = findSetting(canon);
    if (!row) return fallbackOn;
    return !!row.enabled && !row.hidden;
  }

  function labelFor(canon: CanonKey, fallbackLabel: string) {
    const row = findSetting(canon);
    const label = s(row?.kpi_name) || s(row?.label);
    return label || fallbackLabel;
  }

  return { isOn, labelFor };
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SmartPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const sp = await Promise.resolve(searchParams);
  const sb = getSupabase();

  const [
    { data: rowsData, error: rankingsError },
    { data: regionPeople, error: regionPeopleError },
    { data: divisionPeople, error: divisionPeopleError },
    { data: settingsRows, error: settingsError },
    { data: techData, error: techError },
  ] = await Promise.all([
    sb.from("master_kpi_feed_mv").select("*"),
    sb.from("kpi_region_people_v1").select("region,director_label,rm_label"),
    sb.from("kpi_division_people_v1").select("division_name,vp_of_operations,director_label"),
    sb
      .from("kpi_metric_settings_v1")
      .select("scope,metric_name,label,kpi_name,enabled,weight,sort_order,format,hidden")
      .eq("scope", "global"),
    sb.from("tech_scorecard_ranked_v1").select("*"),
  ]);

  const fatalError = rankingsError ?? regionPeopleError ?? divisionPeopleError ?? settingsError ?? techError;
  if (fatalError) {
    return (
      <main style={{ padding: PAGE.padding }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>S.M.A.R.T.</h1>
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f2c2c2", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Could not load data</div>
          <div style={{ opacity: 0.85, marginTop: 6 }}>{fatalError.message}</div>
        </div>
      </main>
    );
  }

  const settings = buildSettingsIndex((settingsRows ?? []) as SettingRow[]);
  const rows = (rowsData ?? []) as RankRow[];

  const monthFromUrl = firstParam(sp?.month).trim();

// month candidates from BOTH feeds
const techMonths = uniq((techData ?? []).map((t: any) => String(t?.fiscal_month_anchor ?? "")).filter(Boolean));
const masterMonths = uniq(rows.map((r) => String(r.fiscal_month_anchor ?? "")).filter(Boolean));

const allMonths = uniq([...masterMonths, ...techMonths]).sort(); // YYYY-MM-DD sorts naturally
const inferredMonth = allMonths[allMonths.length - 1] ?? "";

const month = (monthFromUrl || inferredMonth).trim();


  const selectedDivisionId = firstParam(sp?.division_id).trim();
  const selectedRegionId = firstParam(sp?.region_id).trim();
  const selectedCompanyCode = firstParam(sp?.company_code).trim();

  /** People maps */
  const regionPeopleByName = new Map<string, { director_label: string; rm_label: string }>();
  for (const r of regionPeople ?? []) {
    const key = s((r as any).region);
    if (!key) continue;
    regionPeopleByName.set(key, {
      director_label: s((r as any).director_label) || "—",
      rm_label: s((r as any).rm_label) || "—",
    });
  }

  const divisionPeopleByName = new Map<string, { vp_of_operations: string; director_label: string }>();
  for (const d of divisionPeople ?? []) {
    const key = s((d as any).division_name);
    if (!key) continue;
    divisionPeopleByName.set(key, {
      vp_of_operations: s((d as any).vp_of_operations) || "—",
      director_label: s((d as any).director_label) || "—",
    });
  }

  /** Master feed slices (month scoped) */
  const divRows = rows.filter((r) => r.level === "division" && r.rank_scope === "all_in" && r.fiscal_month_anchor === month);
  const regionRows = rows.filter((r) => r.level === "region" && r.rank_scope === "all_in" && r.fiscal_month_anchor === month);
  const itgRows = rows.filter((r) => r.level === "itg_supervisor" && r.rank_scope === "region" && r.fiscal_month_anchor === month);

  const byRankMaster = (a: RankRow, b: RankRow) =>
    (n(a.rank_overall) ?? 9e15) - (n(b.rank_overall) ?? 9e15) ||
    (n(b.total_jobs) ?? 0) - (n(a.total_jobs) ?? 0) ||
    COLLATOR.compare(s(a.level_key), s(b.level_key)) ||
    COLLATOR.compare(s(a.display_name), s(b.display_name));

  divRows.sort(byRankMaster);
  regionRows.sort(byRankMaster);
  itgRows.sort(byRankMaster);

  /** Division options */
  const divisionOptions: Array<{ id: string; name: string }> = Array.from(
    new Map(
      divRows
        .map((r) => ({ id: s(r.division_id), name: s(r.division_name ?? r.display_name) }))
        .filter((x) => x.id && x.name)
        .map((x) => [x.id, x] as const)
    ).values()
  ).sort((a, b) => COLLATOR.compare(a.name, b.name));

  const divisionIdIsValid = !selectedDivisionId || divisionOptions.some((d) => d.id === selectedDivisionId);
  const effectiveDivisionId = divisionIdIsValid ? selectedDivisionId : "";

  /** Region options (all + division-filtered list for UI) */
  const regionOptionsAll: Array<{ id: string; name: string; divisionId: string | null }> = Array.from(
    new Map(
      regionRows
        .map((r) => ({
          id: s(r.region_id),
          name: s(r.region_name ?? r.display_name),
          divisionId: r.division_id ? s(r.division_id) : null,
        }))
        .filter((x) => x.id && x.name)
        .map((x) => [x.id, x] as const)
    ).values()
  );

  const regionOptions = regionOptionsAll
    .filter((r) => (effectiveDivisionId ? r.divisionId === effectiveDivisionId : true))
    .sort((a, b) => COLLATOR.compare(a.name, b.name));

  /** Validate region_id against all options (not only the division-filtered list) */
  const regionIdIsValid = !selectedRegionId || regionOptionsAll.some((o) => o.id === selectedRegionId);
  const effectiveRegionId = regionIdIsValid ? selectedRegionId : "";

  const regionIdToName = new Map(regionOptionsAll.map((o) => [o.id, o.name] as const));

  /** Master filtered slices */
  const filteredDivRows = divRows.filter((r) => (effectiveDivisionId ? s(r.division_id) === effectiveDivisionId : true));
  const filteredRegionRows = regionRows
    .filter((r) => (effectiveDivisionId ? s(r.division_id) === effectiveDivisionId : true))
    .filter((r) => (effectiveRegionId ? s(r.region_id) === effectiveRegionId : true));
  const filteredItgRows = itgRows
    .filter((r) => (effectiveDivisionId ? s(r.division_id) === effectiveDivisionId : true))
    .filter((r) => (effectiveRegionId ? s(r.region_id) === effectiveRegionId : true));

  /** =========================================================
   *  CANONICAL NAME-SET MATCHING (month scoped)
   *  ========================================================= */
  const divisionNamesForSelected = new Set<string>();
  if (effectiveDivisionId) {
    for (const r of divRows) {
      if (s(r.division_id) !== effectiveDivisionId) continue;
      const a = s(r.division_name ?? r.display_name);
      if (a) divisionNamesForSelected.add(normOrgLabel(a));
    }
  }

  const regionNamesForSelected = new Set<string>();
  if (effectiveRegionId) {
    for (const r of regionRows) {
      if (s(r.region_id) !== effectiveRegionId) continue;
      const a = s(r.region_name ?? r.display_name);
      if (a) regionNamesForSelected.add(normOrgLabel(a));
    }
  }

  const selectedDivisionName = effectiveDivisionId
    ? divisionOptions.find((d) => d.id === effectiveDivisionId)?.name ?? ""
    : "";

  const selectedRegionName = effectiveRegionId ? regionIdToName.get(effectiveRegionId) ?? "" : "";

  /** =========================================================
   *  TECH FEED -> RankRow
   *  ========================================================= */
  const techRowsAsRank: RankRow[] = (techData ?? []).map((t: any) => {
    const fiscal = s(t.fiscal_month_anchor);
    const techId = s(t.tech_id);
    const techName = s(t.tech_name) || s(t.roster_full_name);

    const regionText = s(t.region) || s(t.roster_region);
    const rosterDivision = s(t.roster_division);

    const company = s(t.c_code) || s(t.roster_c_code) || s(t.company_code);

    const techKey = s(t.tech_key) || `${fiscal}:${regionText}:${techId || techName}`;

    return {
      fiscal_month_anchor: fiscal,
      level: "tech",
      rank_scope: "region",

      display_name: techName || techId || null,
      level_key: techKey,

      division_id: null,
      division_name: rosterDivision || null,

      region_id: null,
      region_name: regionText || null,

      company_code: company || null,

      itg_supervisor: s(t.itg_supervisor) || s(t.roster_itg_supervisor) || null,
      supervisor: s(t.supervisor) || s(t.roster_supervisor) || null,

      tech_id: techId || null,
      tech_key: techKey || null,

      headcount: null,
      total_jobs: n(t.total_jobs),

      tnps: n(t.tnps_rate), // number 0..100
      ftr: n(t.ftr_pct), // ratio
      tool_usage: n(t.tool_usage_pct), // ratio

      rank_overall: n(t.rank_region),
      weighted_score: n(t.factor),
    };
  });

  /** =========================================================
   *  TECH SCOPE (truth): month + canonical division + canonical region
   *  ========================================================= */
  const techScoped = techRowsAsRank
    .filter((r) => (month ? s(r.fiscal_month_anchor) === month : true))
    .filter((r) => {
      if (!effectiveDivisionId) return true;
      const dv = normOrgLabel(r.division_name);
      return dv && divisionNamesForSelected.has(dv);
    })
    .filter((r) => {
      if (!effectiveRegionId) return true;
      const rg = normOrgLabel(r.region_name);
      return rg && regionNamesForSelected.has(rg);
    });

  /** Company options derived ONLY from scoped tech truth */
  const companyOptions = Array.from(
    new Map(
      techScoped
        .map((r) => s(r.company_code))
        .filter(Boolean)
        .map((code) => [code, { code }] as const)
    ).values()
  ).sort((a, b) => COLLATOR.compare(a.code, b.code));

  const companyIsValid = !selectedCompanyCode || companyOptions.some((c) => c.code === selectedCompanyCode);
  const effectiveCompanyCode = companyIsValid ? selectedCompanyCode : "";

  /** Tech rows filtered by company (after scope) */
  const filteredTechRows = techScoped
    .filter((r) => (effectiveCompanyCode ? s(r.company_code) === effectiveCompanyCode : true))
    .sort((a, b) => {
      const ra = n(a.rank_overall) ?? 9e15;
      const rb = n(b.rank_overall) ?? 9e15;
      if (ra !== rb) return ra - rb;

      const fa = n(a.weighted_score) ?? 9e15;
      const fb = n(b.weighted_score) ?? 9e15;
      if (fa !== fb) return fa - fb;

      const ja = n(a.total_jobs) ?? -1;
      const jb = n(b.total_jobs) ?? -1;
      if (ja !== jb) return jb - ja;

      return COLLATOR.compare(s(a.tech_key), s(b.tech_key));
    });

  /** =========================================================
   *  COMPANY GRID derived from scoped tech truth
   *  ========================================================= */
  type CompanyAgg = {
    code: string;
    techIds: Set<string>;
    totalJobs: number;
    tnpsSum: number;
    tnpsN: number;
    ftrSum: number;
    ftrN: number;
    tuSum: number;
    tuN: number;
    factorSum: number;
    factorN: number;
  };

  const companyAgg = new Map<string, CompanyAgg>();

  for (const r of techScoped) {
    const code = s(r.company_code);
    if (!code) continue;

    let a = companyAgg.get(code);
    if (!a) {
      a = {
        code,
        techIds: new Set<string>(),
        totalJobs: 0,
        tnpsSum: 0,
        tnpsN: 0,
        ftrSum: 0,
        ftrN: 0,
        tuSum: 0,
        tuN: 0,
        factorSum: 0,
        factorN: 0,
      };
      companyAgg.set(code, a);
    }

    const tid = s(r.tech_id) || s(r.tech_key);
    if (tid) a.techIds.add(tid);

    a.totalJobs += n(r.total_jobs) ?? 0;

    const tn = n(r.tnps);
    if (tn !== null) {
      a.tnpsSum += tn;
      a.tnpsN += 1;
    }

    const f = n(r.ftr);
    if (f !== null) {
      a.ftrSum += f;
      a.ftrN += 1;
    }

    const tu = n(r.tool_usage);
    if (tu !== null) {
      a.tuSum += tu;
      a.tuN += 1;
    }

    const fac = n(r.weighted_score);
    if (fac !== null) {
      a.factorSum += fac;
      a.factorN += 1;
    }
  }

  const companyRowsDerived: RankRow[] = Array.from(companyAgg.values()).map((a) => {
    const avgTnps = a.tnpsN ? a.tnpsSum / a.tnpsN : null;
    const avgFtr = a.ftrN ? a.ftrSum / a.ftrN : null;
    const avgTu = a.tuN ? a.tuSum / a.tuN : null;
    const avgFactor = a.factorN ? a.factorSum / a.factorN : null;

    return {
      fiscal_month_anchor: month,
      level: "company",
      rank_scope: "scoped",

      display_name: a.code,
      level_key: a.code,

      division_id: effectiveDivisionId || null,
      division_name: selectedDivisionName || null,

      region_id: effectiveRegionId || null,
      region_name: selectedRegionName || null,

      company_code: a.code,

      itg_supervisor: null,
      supervisor: null,
      tech_id: null,
      tech_key: null,

      headcount: a.techIds.size,
      total_jobs: a.totalJobs,

      tnps: avgTnps,
      ftr: avgFtr,
      tool_usage: avgTu,

      rank_overall: null,
      weighted_score: avgFactor, // best is lowest
    };
  });

  companyRowsDerived.sort((a, b) => {
    const fa = n(a.weighted_score) ?? 9e15;
    const fb = n(b.weighted_score) ?? 9e15;
    if (fa !== fb) return fa - fb;

    const ja = n(a.total_jobs) ?? 0;
    const jb = n(b.total_jobs) ?? 0;
    if (ja !== jb) return jb - ja;

    return COLLATOR.compare(s(a.company_code), s(b.company_code));
  });

  for (let i = 0; i < companyRowsDerived.length; i++) {
    companyRowsDerived[i].rank_overall = i + 1;
  }

  const filteredCompanyRows = companyRowsDerived.filter((r) =>
    effectiveCompanyCode ? s(r.company_code) === effectiveCompanyCode : true
  );

  /** =========================================================
   *  Common column builders
   *  ========================================================= */
  const col_headcount: Col = {
    key: "headcount",
    label: settings.labelFor("headcount", "Headcount"),
    right: true,
    hidden: !settings.isOn("headcount", true),
    render: (r) => fmtInt(n(r.headcount) ?? 0),
  };

  const col_tnps: Col = {
    key: "tnps",
    label: settings.labelFor("tnps", "tNPS"),
    right: true,
    hidden: !settings.isOn("tnps"),
    render: (r: RankRow) => fmtNum(n(r.tnps), 2),
  };

  const col_ftr: Col = {
    key: "ftr",
    label: settings.labelFor("ftr", "FTR%"),
    right: true,
    hidden: !settings.isOn("ftr"),
    render: (r: RankRow) => fmtPctRatio(n(r.ftr), 1),
  };

  const col_tool: Col = {
    key: "tool_usage",
    label: settings.labelFor("tool_usage", "ToolUsage%"),
    right: true,
    hidden: !settings.isOn("tool_usage"),
    render: (r: RankRow) => fmtPctRatio(n(r.tool_usage), 2),
  };

  const col_total_jobs: Col = {
    key: "total_jobs",
    label: settings.labelFor("total_jobs", "Total Jobs"),
    right: true,
    hidden: !settings.isOn("total_jobs", true),
    render: (r: RankRow) => fmtInt(n(r.total_jobs) ?? 0),
  };

  const CompanyControls = (
    <form method="GET" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <label style={{ fontSize: UI.fontSize.small, opacity: 0.8 }}>Company</label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" name="company_code" value="" style={chipBtnStyle(effectiveCompanyCode === "")}>
          All Companies
        </button>

        {companyOptions.map((c) => (
          <button
            key={c.code}
            type="submit"
            name="company_code"
            value={c.code}
            style={chipBtnStyle(effectiveCompanyCode === c.code)}
            title={c.code}
          >
            {c.code}
          </button>
        ))}
      </div>

      <input type="hidden" name="division_id" value={effectiveDivisionId} />
      <input type="hidden" name="region_id" value={effectiveRegionId} />
      <input type="hidden" name="month" value={month} />
    </form>
  );

  return (
    <main style={{ padding: PAGE.padding, maxWidth: PAGE.maxWidth, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>S.M.A.R.T.</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>
            Month: <b>{month || "—"}</b> · KPIs Month-to-Date · Page Under Development
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <a href="/" style={navBtnStyle()}>
            Back
          </a>
          <a href="/admin" style={navBtnStyle()}>
            Admin →
          </a>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>{CompanyControls}</div>

      <Section
        title="Division"
        rows={filteredDivRows}
        controls={
          <form method="GET" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: UI.fontSize.small, opacity: 0.8 }}>Division</label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" name="division_id" value="" style={chipBtnStyle(effectiveDivisionId === "")}>
                All Divisions
              </button>

              {divisionOptions.map((d) => (
                <button
                  key={d.id}
                  type="submit"
                  name="division_id"
                  value={d.id}
                  style={chipBtnStyle(effectiveDivisionId === d.id)}
                  title={d.id}
                >
                  {d.name}
                </button>
              ))}
            </div>

            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="region_id" value="" />
            <input type="hidden" name="company_code" value={effectiveCompanyCode} />
          </form>
        }
        actions={
          <a href={exportUrl({ month, level: "division", rank_scope: "all_in" })} style={navBtnStyle()}>
            Export CSV
          </a>
        }
        columns={[
          { key: "display_name", label: "Division", sticky: true },
          {
            key: "__vp",
            label: "VP",
            render: (r) => divisionPeopleByName.get(s(r.display_name))?.vp_of_operations ?? "—",
          },
          {
            key: "__director",
            label: "Director",
            render: (r) => {
              const raw = divisionPeopleByName.get(s(r.display_name))?.director_label ?? "—";
              if (raw === "—") return "—";
              const items = String(raw)
                .split(/\s*,\s*/g)
                .map((x) => x.trim())
                .filter(Boolean);

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {items.map((t, idx) => (
                    <div key={t || String(idx)} style={tagPillStyle()} title={t}>
                      {t}
                    </div>
                  ))}
                </div>
              );
            },
          },
          { key: "rank_overall", label: "Rank", right: true },
          col_headcount,
          col_tnps,
          col_ftr,
          col_tool,
          col_total_jobs,
        ]}
      />

      <Section
        title="Region"
        rows={filteredRegionRows}
        controls={
          <form method="GET" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: UI.fontSize.small, opacity: 0.8 }}>Region</label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="submit" name="region_id" value="" style={chipBtnStyle(effectiveRegionId === "")}>
                All Regions
              </button>

              {regionOptions.map((r) => (
                <button
                  key={r.id}
                  type="submit"
                  name="region_id"
                  value={r.id}
                  style={chipBtnStyle(effectiveRegionId === r.id)}
                  title={r.id}
                >
                  {r.name}
                </button>
              ))}
            </div>

            <input type="hidden" name="division_id" value={effectiveDivisionId} />
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="company_code" value={effectiveCompanyCode} />
          </form>
        }
        actions={
          <a href={exportUrl({ month, level: "region", rank_scope: "all_in" })} style={navBtnStyle()}>
            Export CSV
          </a>
        }
        columns={[
          { key: "display_name", label: "Region", sticky: true },
          {
            key: "__director",
            label: "Director",
            render: (r) => regionPeopleByName.get(s(r.display_name))?.director_label ?? "—",
          },
          {
            key: "__rm",
            label: "Regional/PC Manager",
            render: (r) => regionPeopleByName.get(s(r.display_name))?.rm_label ?? "—",
          },
          { key: "rank_overall", label: "Rank", right: true },
          col_headcount,
          col_tnps,
          col_ftr,
          col_tool,
          col_total_jobs,
        ]}
      />

      <Section
        title="ITG Supervisor"
        rows={filteredItgRows}
        actions={
          <a href={exportUrl({ month, level: "itg_supervisor", rank_scope: "region" })} style={navBtnStyle()}>
            Export CSV
          </a>
        }
        columns={[
          { key: "display_name", label: "ITG Supervisor", sticky: true },
          { key: "region_name", label: "Region", render: (r) => r.region_name ?? "—" },
          col_headcount,
          { key: "rank_overall", label: "Rank", right: true },
          col_tnps,
          col_ftr,
          col_tool,
          col_total_jobs,
        ]}
      />

      <Section
        title="Company (Scoped)"
        subtitle={
          <span>
            Showing <b>{filteredCompanyRows.length}</b> companies
            {selectedDivisionName ? ` · division=${selectedDivisionName}` : ""}
            {selectedRegionName ? ` · region=${selectedRegionName}` : ""}
            {effectiveCompanyCode ? ` · company_code=${effectiveCompanyCode}` : ""}
            {month ? ` · month=${month}` : ""}
          </span>
        }
        rows={filteredCompanyRows}
        columns={[
          { key: "display_name", label: "Company Code", sticky: true },
          { key: "rank_overall", label: "Rank (Scoped)", right: true },
          {
            key: "__factor",
            label: "Factor (avg)",
            right: true,
            render: (r) => fmtNum(n(r.weighted_score), 4),
          },
          col_headcount,
          col_tnps,
          col_ftr,
          col_tool,
          col_total_jobs,
        ]}
      />

      <Section
        title="Tech"
        subtitle={
          <span>
            Showing <b>{filteredTechRows.length}</b> techs
            {selectedDivisionName ? ` · division=${selectedDivisionName}` : ""}
            {selectedRegionName ? ` · region=${selectedRegionName}` : ""}
            {effectiveCompanyCode ? ` · company_code=${effectiveCompanyCode}` : ""}
            {month ? ` · month=${month}` : ""}
          </span>
        }
        rows={filteredTechRows}
        actions={
          <a href={exportUrl({ month, level: "tech", rank_scope: "region" })} style={navBtnStyle()}>
            Export CSV
          </a>
        }
        columns={[
          {
            key: "__tech",
            label: "Tech",
            sticky: true,
            render: (r) => {
              const name = s(r.display_name || r.tech_id) || "—";
              const techId = s(r.tech_id);

              const company = s(r.company_code);
              const itg = s(r.itg_supervisor);

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ fontWeight: 900, lineHeight: "18px" }}>
                    {name}
                    {techId && techId !== name ? (
                      <span style={{ opacity: 0.75, marginLeft: 6, fontWeight: 700 }}>
                        ({techId})
                      </span>
                    ) : null}
                  </div>

                  {company ? (
                    <div style={tagPillStyle({ opacity: 0.85 })} title={company}>
                      {company}
                    </div>
                  ) : null}

                  {itg ? (
                    <div style={tagPillStyle({ opacity: 0.8 })} title={itg}>
                      {itg}
                    </div>
                  ) : null}
                </div>
              );
            },
          },
          { key: "region_name", label: "Region", render: (r) => r.region_name ?? "—" },
          {
            key: "rank_overall",
            label: "Rank (Region)",
            right: true,
            render: (r) => {
              const v = n(r.rank_overall);
              return v === null ? "—" : fmtInt(v);
            },
          },
          col_tnps,
          col_ftr,
          col_tool,
          col_total_jobs,
        ]}
      />
    </main>
  );
}
