// app/smart/page.tsx
import React from "react";
import { createClient } from "@supabase/supabase-js";
import { UI, pillBase } from "@/lib/ui";
import UpstreamFiltersClient from "@/lib/filters/UpstreamFiltersClient";

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
  // Server-side only: use service role
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

/** deterministic param helpers */
function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}
function s(v: any) {
  return String(v ?? "").trim();
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

  tnps: number | null; // number (0..100)
  ftr: number | null; // ratio (0..1) in this UI
  tool_usage: number | null; // ratio (0..1) in this UI

  rank_overall: number | null; // ✅ used for tech rank in region (rank_region)
  weighted_score: number | null; // ✅ “factor” (best = lowest)

  // optional extra passthroughs
  roster_company?: string | null;
  batch_id?: string | null;

  vp_of_operations?: string | null;
  division_director_label?: string | null;
  region_director_label?: string | null;
  rm_label?: string | null;
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

// One source of truth for column widths (tweak as needed)
const COL_W: Record<string, string> = {
  // sticky name columns
  display_name: "140px",
  tech_id: "110px",
  __tech: "280px",

  // people columns
  __vp: "160px",
  __director: "240px",
  __rm: "220px",
  region_name: "160px",

  itg_supervisor: "180px",
  supervisor: "180px",
  company_code: "180px",

  // numeric columns
  rank_overall: "130px",
  headcount: "110px",
  tnps: "110px",
  ftr: "110px",
  tool_usage: "130px",
  total_jobs: "120px",
};

function gridTemplate(columns: Col[]) {
  const fallback = "110px";
  return columns
    .map((c) => {
      if (c.hidden) return "0px";
      return COL_W[c.key] ?? fallback;
    })
    .join(" ");
}

/** -------------------------------------------------------
 *  Render safety: prevent any column renderer from returning
 *  table structure (<tr>, <td>, <tbody>, etc.) anywhere.
 *  ------------------------------------------------------*/
const DISALLOWED_TABLE_TAGS = new Set(["table", "thead", "tbody", "tr", "td", "th"]);

function containsDisallowedTableTags(node: React.ReactNode): boolean {
  let found = false;

  const walk = (nn: React.ReactNode) => {
    if (found || nn === null || nn === undefined || typeof nn === "boolean") return;

    if (Array.isArray(nn)) {
      for (const child of nn) walk(child);
      return;
    }

    if (React.isValidElement(nn)) {
      if (typeof nn.type === "string" && DISALLOWED_TABLE_TAGS.has(nn.type)) {
        found = true;
        return;
      }
      walk((nn.props as any)?.children);
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
 *  Small UI helpers (SMART-specific variants)
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
 *  Settings → Label wiring (UI only)
 *  ========================================================= */
type CanonKey = "tnps" | "ftr" | "tool_usage" | "total_jobs" | "headcount";

function normKey(x: any) {
  return String(x ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

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

/** =========================================================
 *  Options helpers
 *  ========================================================= */
type FilterOpt = { value: string; label: string };

function uniqBy<T>(arr: T[], keyFn: (x: T) => string) {
  const m = new Map<string, T>();
  for (const x of arr) {
    const k = keyFn(x);
    if (!k) continue;
    if (!m.has(k)) m.set(k, x);
  }
  return Array.from(m.values());
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
    // ✅ IMPORTANT: ranked tech view includes rank_region + factor
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
  const month = (monthFromUrl || latestMonth(rows)).trim();

  // upstream filters (dropdowns)
  const selectedDivisionId = firstParam(sp?.division_id).trim();
  const selectedRegionId = firstParam(sp?.region_id).trim();
  const selectedCompanyCode = firstParam((sp as any)?.company_code).trim();

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

  // Base rows by level
  const divRows = rows.filter(
    (r) => r.level === "division" && r.rank_scope === "all_in" && s(r.fiscal_month_anchor) === month
  );
  const regionRows = rows.filter(
    (r) => r.level === "region" && r.rank_scope === "all_in" && s(r.fiscal_month_anchor) === month
  );
  const itgRows = rows.filter(
    (r) => r.level === "itg_supervisor" && r.rank_scope === "region" && s(r.fiscal_month_anchor) === month
  );

  // Company rows (master feed)
  const companyRowsAll = rows.filter(
    (r) => r.level === "company" && r.rank_scope === "all_in" && s(r.fiscal_month_anchor) === month
  );

  const byRank = (a: RankRow, b: RankRow) =>
    (n(a.rank_overall) ?? 9e15) - (n(b.rank_overall) ?? 9e15) ||
    (n(b.total_jobs) ?? 0) - (n(a.total_jobs) ?? 0) ||
    COLLATOR.compare(s(a.level_key), s(b.level_key)) ||
    COLLATOR.compare(s(a.display_name), s(b.display_name));

  divRows.sort(byRank);
  regionRows.sort(byRank);
  itgRows.sort(byRank);
  companyRowsAll.sort(byRank);

  // -----------------------------
  // Build Division dropdown options (ALWAYS populated)
  // -----------------------------
  const divisionOptions: FilterOpt[] = uniqBy(
    divRows
      .map((r) => ({
        value: s(r.division_id),
        label: s(r.division_name ?? r.display_name),
      }))
      .filter((x) => x.value && x.label),
    (x) => x.value
  ).sort((a, b) => COLLATOR.compare(a.label, b.label));

  const divisionIdIsValid = !selectedDivisionId || divisionOptions.some((d) => d.value === selectedDivisionId);
  const effectiveDivisionId = divisionIdIsValid ? selectedDivisionId : "";

  // -----------------------------
  // Build Region dropdown options (populate-all when no division chosen)
  // -----------------------------
  const regionOptions: FilterOpt[] = uniqBy(
    regionRows
      .filter((r) => (effectiveDivisionId ? s(r.division_id) === effectiveDivisionId : true))
      .map((r) => ({
        value: s(r.region_id),
        label: s(r.region_name ?? r.display_name),
      }))
      .filter((x) => x.value && x.label),
    (x) => x.value
  ).sort((a, b) => COLLATOR.compare(a.label, b.label));

  const regionIdIsValid = !selectedRegionId || regionOptions.some((o) => o.value === selectedRegionId);
  const effectiveRegionId = regionIdIsValid ? selectedRegionId : "";

  // Resolve selected region NAME (tech feed uses region text)
  const selectedRegionName =
    effectiveRegionId ? regionOptions.find((o) => o.value === effectiveRegionId)?.label ?? "" : "";

  // -----------------------------
  // TECH GRID: tech_scorecard_ranked_v1 → normalize into RankRow
  // -----------------------------
  const techRowsAsRank: RankRow[] = (techData ?? []).map((t: any) => {
    const fiscal = s(t.fiscal_month_anchor);
    const techId = s(t.tech_id);
    const techName = s(t.tech_name) || s(t.roster_full_name);

    const regionText = s(t.region) || s(t.roster_region) || null;
    const divisionText = s(t.roster_division) || null;

    const companyCode = s(t.c_code) || s(t.roster_c_code) || null;
    const companyName = s(t.roster_company) || null;

    const techKey = s(t.tech_key) || `${fiscal}:${regionText || ""}:${techId || techName}`;

    return {
      fiscal_month_anchor: fiscal,
      level: "tech",
      rank_scope: "region",

      display_name: techName || techId || null,
      level_key: techKey,

      division_id: null,
      division_name: divisionText,

      region_id: null,
      region_name: regionText,

      company_code: companyCode,
      roster_company: companyName,

      itg_supervisor: s(t.itg_supervisor) || s(t.roster_itg_supervisor) || null,
      supervisor: s(t.supervisor) || s(t.roster_supervisor) || null,

      tech_id: techId || null,
      tech_key: techKey || null,

      headcount: null,
      total_jobs: n(t.total_jobs),

      tnps: n(t.tnps_rate), // number (0..100)
      ftr: n(t.ftr_pct), // ratio (0..1)
      tool_usage: n(t.tool_usage_pct), // ratio (0..1)

      // ✅ from ranked view
      rank_overall: n(t.rank_region),
      weighted_score: n(t.factor),

      batch_id: t.batch_id ? String(t.batch_id) : null,
    };
  });

  // Filter TECH rows by month + region name + company code (optional)
  const filteredTechRowsBase = techRowsAsRank
    .filter((r) => (month ? s(r.fiscal_month_anchor) === month : true))
    .filter((r) => (selectedRegionName ? s(r.region_name) === selectedRegionName : true))
    .filter((r) => (selectedCompanyCode ? s(r.company_code) === selectedCompanyCode : true));

  // -----------------------------
  // Company dropdown options:
  // Populate-all if no division/region chosen.
  // But when division/region chosen, restrict to companies present in the tech slice.
  // Labels come from companyRowsAll (display_name), fallback to roster_company, fallback to code.
  // -----------------------------
  const techCompanyCodesInSlice = new Set(filteredTechRowsBase.map((r) => s(r.company_code)).filter(Boolean));

  // master-feed company name by code
  const companyNameByCode = new Map<string, string>();
  for (const c of companyRowsAll) {
    const code = s(c.company_code);
    const name = s(c.display_name);
    if (code && name && !companyNameByCode.has(code)) companyNameByCode.set(code, name);
  }
  // roster company name by code (fallback)
  const rosterCompanyNameByCode = new Map<string, string>();
  for (const t of techRowsAsRank) {
    const code = s(t.company_code);
    const nm = s(t.roster_company);
    if (code && nm && !rosterCompanyNameByCode.has(code)) rosterCompanyNameByCode.set(code, nm);
  }

  const companyOptions: FilterOpt[] = uniqBy(
    (() => {
      // if NO region/division selected → show ALL companies from companyRowsAll
      if (!effectiveDivisionId && !effectiveRegionId) {
        return companyRowsAll
          .map((r) => {
            const code = s(r.company_code);
            const label = s(r.display_name) || rosterCompanyNameByCode.get(code) || code;
            return { value: code, label };
          })
          .filter((x) => x.value && x.label);
      }

      // if division/region selected → show only those present in the filtered tech slice
      return Array.from(techCompanyCodesInSlice).map((code) => ({
        value: code,
        label: companyNameByCode.get(code) || rosterCompanyNameByCode.get(code) || code,
      }));
    })(),
    (x) => x.value
  ).sort((a, b) => COLLATOR.compare(a.label, b.label));

  const companyOk = !selectedCompanyCode || companyOptions.some((c) => c.value === selectedCompanyCode);
  const effectiveCompanyCode = companyOk ? selectedCompanyCode : "";

  // -----------------------------
  // Apply upstream filters to master feed grids (Division/Region/ITG)
  // -----------------------------
  const filteredDivRows = divRows.filter((r) => (effectiveDivisionId ? s(r.division_id) === effectiveDivisionId : true));

  const filteredRegionRows = regionRows
    .filter((r) => (effectiveDivisionId ? s(r.division_id) === effectiveDivisionId : true))
    .filter((r) => (effectiveRegionId ? s(r.region_id) === effectiveRegionId : true));

  const filteredItgRows = itgRows
    .filter((r) => (effectiveDivisionId ? s(r.division_id) === effectiveDivisionId : true))
    .filter((r) => (effectiveRegionId ? s(r.region_id) === effectiveRegionId : true));

  // -----------------------------
  // Company grid respects cascade via tech truth-set when div/region selected
  // -----------------------------
  const filteredCompanyRows = (() => {
    let base = companyRowsAll;

    if (effectiveDivisionId || effectiveRegionId) {
      base = base.filter((r) => techCompanyCodesInSlice.has(s(r.company_code)));
    }

    if (effectiveCompanyCode) {
      base = base.filter((r) => s(r.company_code) === effectiveCompanyCode);
    }

    return base;
  })();

  // -----------------------------
  // Tech rows final: apply company filter (validated) + sort by rank (then name)
  // -----------------------------
  const filteredTechRows = filteredTechRowsBase
    .filter((r) => (effectiveCompanyCode ? s(r.company_code) === effectiveCompanyCode : true))
    .sort((a, b) => {
      const ra = n(a.rank_overall) ?? 9e15;
      const rb = n(b.rank_overall) ?? 9e15;
      if (ra !== rb) return ra - rb;

      return (
        COLLATOR.compare(s(a.region_name), s(b.region_name)) ||
        COLLATOR.compare(s(a.display_name), s(b.display_name)) ||
        COLLATOR.compare(s(a.tech_id), s(b.tech_id))
      );
    });

  /** =========================================================
   *  Common column builders (NO nulls; hide via c.hidden)
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

      {/* ✅ Upstream Cascading Dropdown Filters */}
      <UpstreamFiltersClient divisions={divisionOptions} regions={regionOptions} companies={companyOptions} />

      <Section
        title="Division"
        rows={filteredDivRows}
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
        title="Company"
        subtitle={
          <span>
            Showing <b>{filteredCompanyRows.length}</b> companies
            {effectiveDivisionId ? ` · division_id=${effectiveDivisionId}` : ""}
            {effectiveRegionId ? ` · region_id=${effectiveRegionId}` : ""}
            {effectiveCompanyCode ? ` · company_code=${effectiveCompanyCode}` : ""}
            {month ? ` · month=${month}` : ""}
          </span>
        }
        rows={filteredCompanyRows}
        actions={
          <a href={exportUrl({ month, level: "company", rank_scope: "all_in" })} style={navBtnStyle()}>
            Export CSV
          </a>
        }
        columns={[
          { key: "display_name", label: "Company Name", sticky: true },
          { key: "company_code", label: "Code" },
          col_headcount,
          { key: "rank_overall", label: "Rank", right: true },
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
                      <span style={{ opacity: 0.75, marginLeft: 6, fontWeight: 700 }}>({techId})</span>
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
