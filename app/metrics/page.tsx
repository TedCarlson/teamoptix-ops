import React from "react";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** deterministic string compare (server + client) */
const COLLATOR = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });

function exportUrl(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return `/api/metrics/export?${qs}`;
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

  tnps: number | null;
  ftr: number | null;
  tool_usage: number | null;

  rank_overall: number | null;
  weighted_score: number | null;

  vp_of_operations?: string | null;
  division_director_label?: string | null;
  region_director_label?: string | null;
  rm_label?: string | null;
};

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}

function s(v: any) {
  return String(v ?? "").trim();
}

/** -------------------------------------------------------
 *  Render safety: prevent any column renderer from returning
 *  table structure (<tr>, <td>, <tbody>, etc.) anywhere.
 *  This avoids hydration mismatch from invalid nesting.
 *  ------------------------------------------------------*/
const DISALLOWED_TABLE_TAGS = new Set(["table", "thead", "tbody", "tr", "td", "th"]);

function containsDisallowedTableTags(node: React.ReactNode): boolean {
  let found = false;

  const walk = (n: React.ReactNode) => {
    if (found || n === null || n === undefined || typeof n === "boolean") return;

    if (Array.isArray(n)) {
      for (const child of n) walk(child);
      return;
    }

    if (React.isValidElement(n)) {
      if (typeof n.type === "string" && DISALLOWED_TABLE_TAGS.has(n.type)) {
        found = true;
        return;
      }
      walk((n.props as any)?.children);
      return;
    }
  };

  walk(node);
  return found;
}

function unwrapTd(node: React.ReactNode): React.ReactNode {
  // If a renderer mistakenly returns <td>...</td>, use its children as cell content.
  if (React.isValidElement(node) && typeof node.type === "string" && node.type === "td") {
    return (node.props as any)?.children;
  }
  return node;
}

export default async function MetricsPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const sb = getSupabase();

  const [
    { data: rowsData, error: rankingsError },
    { data: regionPeople, error: regionPeopleError },
    { data: divisionPeople, error: divisionPeopleError },
  ] = await Promise.all([
    sb.from("master_kpi_feed_mv").select("*"),
    sb.from("kpi_region_people_v1").select("region,director_label,rm_label"),
    sb.from("kpi_division_people_v1").select("division_name,vp_of_operations,director_label"),
  ]);

  const fatalError = rankingsError ?? regionPeopleError ?? divisionPeopleError;
  if (fatalError) {
    return (
      <main style={{ padding: 24 }}>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Metrics</h1>
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f2c2c2", borderRadius: 14 }}>
          <div style={{ fontWeight: 950 }}>Could not load metrics data</div>
          <div style={{ opacity: 0.85, marginTop: 6 }}>{fatalError.message}</div>
        </div>
      </main>
    );
  }

  const rows = (rowsData ?? []) as RankRow[];

  const monthFromUrl = firstParam(searchParams?.month).trim();
  const month = (monthFromUrl || latestMonth(rows)).trim();

  // URL param selections (IDs)
  const selectedDivisionId = firstParam(searchParams?.division_id).trim();
  const selectedRegionId = firstParam(searchParams?.region_id).trim();

  // Build people lookup maps
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

  // Scopes (locked)
  const divRows = rows.filter(
    (r) => r.level === "division" && r.rank_scope === "all_in" && r.fiscal_month_anchor === month
  );
  const regionRows = rows.filter(
    (r) => r.level === "region" && r.rank_scope === "all_in" && r.fiscal_month_anchor === month
  );
  const itgRows = rows.filter(
    (r) => r.level === "itg_supervisor" && r.rank_scope === "region" && r.fiscal_month_anchor === month
  );
  const companyRows = rows.filter(
    (r) => r.level === "company" && r.rank_scope === "all_in" && r.fiscal_month_anchor === month
  );
  const techRows = rows.filter(
    (r) => r.level === "tech" && r.rank_scope === "region" && r.fiscal_month_anchor === month
  );

  // Sort: Rank asc, then total jobs desc (deterministic tie-breakers)
  const byRank = (a: RankRow, b: RankRow) =>
    (n(a.rank_overall) ?? 9e15) - (n(b.rank_overall) ?? 9e15) ||
    (n(b.total_jobs) ?? 0) - (n(a.total_jobs) ?? 0) ||
    COLLATOR.compare(s(a.level_key), s(b.level_key)) ||
    COLLATOR.compare(s(a.display_name), s(b.display_name));

  divRows.sort(byRank);
  regionRows.sort(byRank);
  itgRows.sort(byRank);
  companyRows.sort(byRank);
  techRows.sort(byRank);

  // Division options (dedup)
  const divisionOptions: Array<{ id: string; name: string }> = Array.from(
    new Map(
      divRows
        .map((r) => ({
          id: s(r.division_id),
          name: s(r.division_name ?? r.display_name),
        }))
        .filter((x) => x.id && x.name)
        .map((x) => [x.id, x] as const)
    ).values()
  ).sort((a, b) => COLLATOR.compare(a.name, b.name));

  // Guard: if URL contains invalid division_id, treat as "All"
  const divisionIdIsValid = !selectedDivisionId || divisionOptions.some((d) => d.id === selectedDivisionId);
  const effectiveDivisionId = divisionIdIsValid ? selectedDivisionId : "";

  // Region options (dedup), spilled by division selection
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

  // Guard: if region_id is stale for the selected division, treat as "All Regions"
  const regionIdIsValid = !selectedRegionId || regionOptions.some((o) => o.id === selectedRegionId);
  const effectiveRegionId = regionIdIsValid ? selectedRegionId : "";

  // Cascade filters: Division → Region → (ITG/Tech spill)
  const filteredRegionRows = regionRows
    .filter((r) => (effectiveDivisionId ? s(r.division_id) === effectiveDivisionId : true))
    .filter((r) => (effectiveRegionId ? s(r.region_id) === effectiveRegionId : true));

  const filteredItgRows = itgRows
    .filter((r) => (effectiveDivisionId ? s(r.division_id) === effectiveDivisionId : true))
    .filter((r) => (effectiveRegionId ? s(r.region_id) === effectiveRegionId : true));

  const filteredTechRows = techRows
    .filter((r) => (effectiveDivisionId ? s(r.division_id) === effectiveDivisionId : true))
    .filter((r) => (effectiveRegionId ? s(r.region_id) === effectiveRegionId : true));

  return (
    <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Metrics</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>
            Month: <b>{month || "—"}</b> · KPIs Month-to-Date · Page Under Development
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <a href="/" style={btnStyle}>
            Back
          </a>
          <a href="/metrics/upload" style={btnStyle}>
            Uploads →
          </a>
          <a href="/metrics/settings" style={btnStyle}>
            Settings
          </a>
        </div>
      </div>

      <Section
        title="Division"
        rows={divRows}
        controls={
          <form method="GET" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>Division</label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="submit"
                name="division_id"
                value=""
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #ddd",
                  background: effectiveDivisionId === "" ? "#eee" : "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                All Divisions
              </button>

              {divisionOptions.map((d) => (
                <button
                  key={d.id}
                  type="submit"
                  name="division_id"
                  value={d.id}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #ddd",
                    background: effectiveDivisionId === d.id ? "#eee" : "inherit",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title={d.id}
                >
                  {d.name}
                </button>
              ))}
            </div>

            {/* Keep month pinned; clear region whenever division changes */}
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="region_id" value="" />
          </form>
        }
        actions={
          <a href={exportUrl({ month, level: "division", rank_scope: "all_in" })} style={btnStyle}>
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
                    <div
                      key={t || String(idx)}
                      style={{
                        display: "inline-flex",
                        alignSelf: "flex-start",
                        padding: "2px 8px",
                        border: "1px solid #333",
                        borderRadius: 999,
                        fontSize: 12,
                        opacity: 0.95,
                        whiteSpace: "nowrap",
                      }}
                      title={t}
                    >
                      {t}
                    </div>
                  ))}
                </div>
              );
            },
          },
          { key: "rank_overall", label: "Rank", right: true },
          { key: "headcount", label: "Headcount", right: true },
          { key: "tnps", label: "tNPS", right: true, render: (r) => fmtNum(n(r.tnps), 2) },
          { key: "ftr", label: "FTR%", right: true, render: (r) => fmtPctRatio(n(r.ftr), 1) },
          { key: "tool_usage", label: "ToolUsage%", right: true, render: (r) => fmtPctRatio(n(r.tool_usage), 2) },
          { key: "total_jobs", label: "Total Jobs", right: true, render: (r) => fmtInt(n(r.total_jobs) ?? 0) },
        ]}
      />

      <Section
        title="Region"
        rows={filteredRegionRows}
        controls={
          <form method="GET" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, opacity: 0.8 }}>Region</label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="submit"
                name="region_id"
                value=""
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #ddd",
                  background: effectiveRegionId === "" ? "#eee" : "inherit",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                All Regions
              </button>

              {regionOptions.map((r) => (
                <button
                  key={r.id}
                  type="submit"
                  name="region_id"
                  value={r.id}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid #ddd",
                    background: effectiveRegionId === r.id ? "#eee" : "inherit",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                  title={r.id}
                >
                  {r.name}
                </button>
              ))}
            </div>

            {/* Keep cascade pinned */}
            <input type="hidden" name="division_id" value={effectiveDivisionId} />
            <input type="hidden" name="month" value={month} />
          </form>
        }
        actions={
          <a href={exportUrl({ month, level: "region", rank_scope: "all_in" })} style={btnStyle}>
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
          { key: "headcount", label: "Headcount", right: true },
          { key: "tnps", label: "tNPS", right: true, render: (r) => fmtNum(n(r.tnps), 2) },
          { key: "ftr", label: "FTR%", right: true, render: (r) => fmtPctRatio(n(r.ftr), 1) },
          { key: "tool_usage", label: "ToolUsage%", right: true, render: (r) => fmtPctRatio(n(r.tool_usage), 2) },
          { key: "total_jobs", label: "Total Jobs", right: true, render: (r) => fmtInt(n(r.total_jobs) ?? 0) },
        ]}
      />

      <Section
        title="ITG Supervisor"
        rows={filteredItgRows}
        actions={
          <a href={exportUrl({ month, level: "itg_supervisor", rank_scope: "region" })} style={btnStyle}>
            Export CSV
          </a>
        }
        columns={[
          { key: "display_name", label: "ITG Supervisor", sticky: true },
          { key: "region_name", label: "Region", render: (r) => r.region_name ?? "—" },
          { key: "headcount", label: "Headcount", right: true },
          { key: "rank_overall", label: "Rank", right: true },
          { key: "tnps", label: "tNPS", right: true, render: (r) => fmtNum(n(r.tnps), 2) },
          { key: "ftr", label: "FTR%", right: true, render: (r) => fmtPctRatio(n(r.ftr), 1) },
          { key: "tool_usage", label: "ToolUsage%", right: true, render: (r) => fmtPctRatio(n(r.tool_usage), 2) },
          { key: "total_jobs", label: "Total Jobs", right: true, render: (r) => fmtInt(n(r.total_jobs) ?? 0) },
        ]}
      />

      <Section
        title="Company"
        rows={companyRows}
        actions={
          <a href={exportUrl({ month, level: "company", rank_scope: "all_in" })} style={btnStyle}>
            Export CSV
          </a>
        }
        columns={[
          { key: "display_name", label: "Company Name", sticky: true },
          { key: "headcount", label: "Headcount", right: true },
          { key: "rank_overall", label: "Rank", right: true },
          { key: "tnps", label: "tNPS", right: true, render: (r) => fmtNum(n(r.tnps), 2) },
          { key: "ftr", label: "FTR%", right: true, render: (r) => fmtPctRatio(n(r.ftr), 1) },
          { key: "tool_usage", label: "ToolUsage%", right: true, render: (r) => fmtPctRatio(n(r.tool_usage), 2) },
          { key: "total_jobs", label: "Total Jobs", right: true, render: (r) => fmtInt(n(r.total_jobs) ?? 0) },
        ]}
      />

      <Section
        title="Tech"
        rows={filteredTechRows}
        actions={
          <a href={exportUrl({ month, level: "tech", rank_scope: "region" })} style={btnStyle}>
            Export CSV
          </a>
        }
        columns={[
          { key: "tech_id", label: "Tech ID", sticky: true, render: (r) => r.tech_id ?? "—" },
          { key: "company_code", label: "Company Code", render: (r) => r.company_code ?? "—" },
          { key: "itg_supervisor", label: "ITG Supervisor", render: (r) => r.itg_supervisor ?? "—" },
          { key: "supervisor", label: "Supervisor", render: (r) => r.supervisor ?? "—" },
          { key: "region_name", label: "Region", render: (r) => r.region_name ?? "—" },
          { key: "rank_overall", label: "Rank", right: true },
          { key: "tnps", label: "tNPS", right: true, render: (r) => fmtNum(n(r.tnps), 2) },
          { key: "ftr", label: "FTR%", right: true, render: (r) => fmtPctRatio(n(r.ftr), 1) },
          { key: "tool_usage", label: "ToolUsage%", right: true, render: (r) => fmtPctRatio(n(r.tool_usage), 2) },
          { key: "total_jobs", label: "Total Jobs", right: true, render: (r) => fmtInt(n(r.total_jobs) ?? 0) },
        ]}
      />
    </main>
  );
}

type Col = {
  key: string;
  label: string;
  right?: boolean;
  sticky?: boolean;
  render?: (row: RankRow) => React.ReactNode;
};

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
  return (
    <section style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 14, overflow: "hidden" }}>
      <div
        style={{
          padding: 12,
          borderBottom: "1px solid #ddd",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontWeight: 950 }}>{title}</div>
          {subtitle ? <div style={{ opacity: 0.8, fontSize: 12 }}>{subtitle}</div> : null}
          {controls ? <div style={{ marginTop: 6 }}>{controls}</div> : null}
        </div>

        {actions ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{actions}</div> : null}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{
                    ...thBase,
                    ...(c.right ? { textAlign: "right" } : null),
                    ...(c.sticky ? thSticky : null),
                  }}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              // Strong stable key (avoid collisions across scopes/levels/months)
              const rowKey = [
                s(r.fiscal_month_anchor),
                s(r.rank_scope),
                s(r.level),
                s(r.level_key),
                s(r.division_id),
                s(r.region_id),
                s(r.tech_id),
                s(r.company_code),
                s(r.display_name),
              ]
                .filter(Boolean)
                .join("|");

              return (
                <tr key={rowKey}>
                  {columns.map((c) => {
                    let raw: React.ReactNode = c.render ? c.render(r) : (r as any)[c.key];

                    // Normalize
                    raw = unwrapTd(raw);

                    // Hard sanitize: never allow table tags anywhere in cell content
                    if (containsDisallowedTableTags(raw)) raw = "—";

                    const val = raw ?? "—";

                    return (
                      <td
                        key={c.key}
                        style={{
                          ...tdBase,
                          ...(c.right ? { textAlign: "right", fontVariantNumeric: "tabular-nums" } : null),
                          ...(c.sticky ? tdSticky : null),
                          ...(c.sticky ? { fontWeight: 900 } : null),
                        }}
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 12, opacity: 0.7 }}>
                  No rows found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** styles */
const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #ddd",
  textDecoration: "none",
  fontWeight: 900,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
};

const thBase: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
  opacity: 0.9,
  whiteSpace: "nowrap",
};

const tdBase: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
  fontSize: 13,
  whiteSpace: "nowrap",
  background: "inherit",
};

const thSticky: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 3,
  background: "inherit",
};

const tdSticky: React.CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  background: "inherit",
};
