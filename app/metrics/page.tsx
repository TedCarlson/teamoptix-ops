import React from "react";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, anon, { auth: { persistSession: false } });
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
  level: string;
  rank_scope: string;
  fiscal_month_anchor: string;

  level_key: string;
  display_name: string | null;

  division: string | null;
  region: string | null;
  company: string | null;

  itg_supervisor: string | null;
  supervisor: string | null;

  tech_id: string | null;
  tech_key: string | null;

  headcount: number | null;
  total_jobs: number | null;

  tnps: number | null;
  ftr: number | null;        // ratio 0..1
  tool_usage: number | null; // ratio 0..1

  rank_overall: number | null;
  weighted_score: number | null;
};

export default async function MetricsPage() {
  const sb = getSupabase();

  const [
    { data: rowsData, error: rankingsError },
    { data: regionPeople, error: regionPeopleError },
    { data: divisionPeople, error: divisionPeopleError },
  ] = await Promise.all([
    sb.from("kpi_meta_rankings_v2").select("*"),
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
  const month = latestMonth(rows);

  // Build people lookup maps
  const regionPeopleByName = new Map<string, { director_label: string; rm_label: string }>();
  for (const r of regionPeople ?? []) {
    const key = String((r as any).region ?? "").trim();
    if (!key) continue;
    regionPeopleByName.set(key, {
      director_label: String((r as any).director_label ?? "—"),
      rm_label: String((r as any).rm_label ?? "—"),
    });
  }

  const divisionPeopleByName = new Map<string, { vp_of_operations: string; director_label: string }>();
  for (const d of divisionPeople ?? []) {
    const key = String((d as any).division_name ?? "").trim();
    if (!key) continue;
    divisionPeopleByName.set(key, {
      vp_of_operations: String((d as any).vp_of_operations ?? "—"),
      director_label: String((d as any).director_label ?? "—"),
    });
  }

  // Scopes (locked, no toggles)
  const divRows = rows.filter((r) => r.level === "division" && r.rank_scope === "all_in" && r.fiscal_month_anchor === month);
  const regionRows = rows.filter((r) => r.level === "region" && r.rank_scope === "all_in" && r.fiscal_month_anchor === month);
  const itgRows = rows.filter((r) => r.level === "itg_supervisor" && r.rank_scope === "region" && r.fiscal_month_anchor === month);
  const companyRows = rows.filter((r) => r.level === "company" && r.rank_scope === "all_in" && r.fiscal_month_anchor === month);
  const techRows = rows.filter((r) => r.level === "tech" && r.rank_scope === "region" && r.fiscal_month_anchor === month);

  // Sort: Rank asc, then total jobs desc
  const byRank = (a: RankRow, b: RankRow) =>
    (n(a.rank_overall) ?? 9e15) - (n(b.rank_overall) ?? 9e15) || (n(b.total_jobs) ?? 0) - (n(a.total_jobs) ?? 0);

  divRows.sort(byRank);
  regionRows.sort(byRank);
  itgRows.sort(byRank);
  companyRows.sort(byRank);
  techRows.sort(byRank);

  return (
    <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Metrics</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>
            Month: <b>{month || "—"}</b> · KPIs Month-to-Date
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <a href="/" style={btnStyle}>Back</a>
          <a href="/metrics/upload" style={btnStyle}>Uploads →</a>
          <a href="/metrics/settings" style={btnStyle}>Settings</a>
        </div>
      </div>

      <Section
        title="Division"
        subtitle="Division | VP | Director | Rank | Headcount | KPIs | Total Jobs"
        rows={divRows}
        columns={[
          { key: "display_name", label: "Division", sticky: true },
          {
            key: "__vp",
            label: "VP",
            render: (r) => divisionPeopleByName.get(String(r.display_name ?? "").trim())?.vp_of_operations ?? "—",
          },
          {
  key: "__director",
  label: "Director",
  render: (r) => {
    const raw =
      divisionPeopleByName.get(String(r.display_name ?? "").trim())?.director_label ?? "—";

    if (raw === "—") return "—";

    const items = String(raw)
      .split(/\s*,\s*/g)
      .map((s) => s.trim())
      .filter(Boolean);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((t, idx) => (
          <div
            key={idx}
            style={{
              display: "inline-flex",
              alignSelf: "flex-start",
              padding: "2px 8px",
              border: "1px solid #333",
              borderRadius: 999,
              fontSize: 12,
              opacity: 0.95,
              whiteSpace: "nowrap", // 👈 prevents Gloyd / Bucknor wrapping
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
        subtitle="Region | Director | Regional/PC Manager | Rank | Headcount | KPIs | Total Jobs"
        rows={regionRows}
        columns={[
          { key: "display_name", label: "Region", sticky: true },
          {
            key: "__director",
            label: "Director",
            render: (r) => regionPeopleByName.get(String(r.display_name ?? "").trim())?.director_label ?? "—",
          },
          {
            key: "__rm",
            label: "Regional/PC Manager",
            render: (r) => regionPeopleByName.get(String(r.display_name ?? "").trim())?.rm_label ?? "—",
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
        subtitle="ITG Supervisor | Region | Headcount | Rank | KPIs | Total Jobs"
        rows={itgRows}
        columns={[
          { key: "display_name", label: "ITG Supervisor", sticky: true },
          { key: "region", label: "Region" },
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
        subtitle="Company Name | Headcount | Rank | KPIs | Total Jobs"
        rows={companyRows}
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
        subtitle="Tech ID | Company Code | ITG Supervisor | Supervisor | Region | Rank | KPIs | Total Jobs"
        rows={techRows}
        columns={[
          { key: "tech_id", label: "Tech ID", sticky: true, render: (r) => r.tech_id ?? "—" },
          { key: "company", label: "Company Code", render: (r) => r.company ?? "—" },
          { key: "itg_supervisor", label: "ITG Supervisor", render: (r) => r.itg_supervisor ?? "—" },
          { key: "supervisor", label: "Supervisor", render: (r) => r.supervisor ?? "—" },
          { key: "region", label: "Region", render: (r) => r.region ?? "—" },
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

function Section({ title, subtitle, rows, columns }: { title: string; subtitle: string; rows: RankRow[]; columns: Col[] }) {
  return (
    <section style={{ marginTop: 16, border: "1px solid #ddd", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: 12, borderBottom: "1px solid #ddd" }}>
        <div style={{ fontWeight: 950 }}>{title}</div>
        <div style={{ marginTop: 4, opacity: 0.8, fontSize: 12 }}>{subtitle}</div>
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
            {rows.map((r, i) => (
              <tr key={`${r.level_key}-${i}`}>
                {columns.map((c) => {
                  const val = c.render ? c.render(r) : (r as any)[c.key];
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
                      {val ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}

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
