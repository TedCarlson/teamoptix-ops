// app/roster/page.tsx
import React from "react";
import { createClient } from "@supabase/supabase-js";
import Filters from "./Filters";
import { UI, pillBase } from "../../lib/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** =========================================================
 *  PAGE-SPECIFIC UI (layout + colors live here)
 *  Shared UI primitives come from /lib/ui.ts
 *  ========================================================= */
const PAGE = {
  maxWidth: 900,
  padding: 40,
  card: {
    radius: 12,
    border: "1px solid #ddd",
    padding: 10,
  },
  statusText: {
    active: "#3f6fd7ff", // blue
    inactive: "#6B7280", // gray
  },
};

const COLLATOR = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });

type RosterRow = {
  roster_id: string;
  insight_person_id: string | null;
  full_name: string | null;
  tech_id: string | null;
  division: string | null;
  region: string | null;
  pc: string | null;
  start_date: string | null;
  end_date: string | null;
  itg_supervisor: string | null;
  company: string | null;
  status: string | null;
};

function getSupabaseServer() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL fallback)");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, { auth: { persistSession: false } });
}

function s(v: any) {
  return String(v ?? "").trim();
}

function uniqSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => s(v)).filter(Boolean))).sort((a, b) => COLLATOR.compare(a, b));
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function RosterPage({
  searchParams,
}: {
  searchParams: SearchParams | Promise<SearchParams>;
}) {
  const sb = getSupabaseServer();
  const sp = await Promise.resolve(searchParams);

  const get = (k: string) => {
    const v = sp[k];
    return s(Array.isArray(v) ? v[0] : v);
  };

  const selectedDivision = get("division");
  const selectedRegion = get("region");
  const selectedCompany = get("company");
  const selectedItg = get("itg_supervisor");
  const selectedStatusRaw = get("status"); // "" | "active" | "inactive"

  // Default status = active
  const statusOk = !selectedStatusRaw || selectedStatusRaw === "active" || selectedStatusRaw === "inactive";
  const effectiveStatus = statusOk ? (selectedStatusRaw || "active") : "active";

  // Load columns needed to build filter options
  const optsRes = await sb.from("roster_v2").select("division, region, company, itg_supervisor");
  const optionsErrorMsg = optsRes.error ? optsRes.error.message : null;
  const all = optsRes.data ?? [];

  // Division options
  const divisions = uniqSorted(all.map((r: any) => r.division));
  const divisionOk = !selectedDivision || divisions.includes(selectedDivision);
  const effectiveDivision = divisionOk ? selectedDivision : "";

  // Region options depend on division
  const regionPool = effectiveDivision ? all.filter((r: any) => s(r.division) === effectiveDivision) : all;
  const regions = uniqSorted(regionPool.map((r: any) => r.region));
  const regionOk = !selectedRegion || regions.includes(selectedRegion);
  const effectiveRegion = regionOk ? selectedRegion : "";

  // Company options depend on division + region
  const companyPool = all.filter((r: any) => {
    const dOk = !effectiveDivision || s(r.division) === effectiveDivision;
    const rOk = !effectiveRegion || s(r.region) === effectiveRegion;
    return dOk && rOk;
  });
  const companies = uniqSorted(companyPool.map((r: any) => r.company));
  const companyOk = !selectedCompany || companies.includes(selectedCompany);
  const effectiveCompany = companyOk ? selectedCompany : "";

  // ITG options depend on division + region + company
  const itgSupPool = all.filter((r: any) => {
    const dOk = !effectiveDivision || s(r.division) === effectiveDivision;
    const rOk = !effectiveRegion || s(r.region) === effectiveRegion;
    const cOk = !effectiveCompany || s(r.company) === effectiveCompany;
    return dOk && rOk && cOk;
  });
  const itgSupervisors = uniqSorted(itgSupPool.map((r: any) => r.itg_supervisor));
  const itgOk = !selectedItg || itgSupervisors.includes(selectedItg);
  const effectiveItg = itgOk ? selectedItg : "";

  // Preserve filters for returnTo
  const qs = new URLSearchParams();
  if (effectiveDivision) qs.set("division", effectiveDivision);
  if (effectiveRegion) qs.set("region", effectiveRegion);
  if (effectiveCompany) qs.set("company", effectiveCompany);
  if (effectiveItg) qs.set("itg_supervisor", effectiveItg);
  if (effectiveStatus) qs.set("status", effectiveStatus);

  const returnTo = `/roster${qs.toString() ? `?${qs.toString()}` : ""}`;

  // Load roster rows (default status active)
  let rows: RosterRow[] = [];
  let errorMsg: string | null = null;

  {
    let q = sb
      .from("roster_v2")
      .select(
        "roster_id, insight_person_id, full_name, tech_id, division, region, pc, start_date, end_date, status, itg_supervisor, company"
      )
      .order("full_name", { ascending: true });

    if (effectiveDivision) q = q.eq("division", effectiveDivision);
    if (effectiveRegion) q = q.eq("region", effectiveRegion);
    if (effectiveCompany) q = q.eq("company", effectiveCompany);
    if (effectiveItg) q = q.eq("itg_supervisor", effectiveItg);

    // Status uses end_date logic
    if (effectiveStatus === "active") q = q.is("end_date", null);
    if (effectiveStatus === "inactive") q = q.not("end_date", "is", null);

    const { data, error } = await q;
    if (error) errorMsg = error.message;
    rows = (data ?? []) as RosterRow[];
  }

  const navBtn = (extra?: React.CSSProperties) =>
    pillBase({
      padding: "10px 14px",
      borderRadius: 12,
      fontWeight: UI.fontWeight.strong,
      ...extra,
    });

  return (
    <main style={{ padding: PAGE.padding, maxWidth: PAGE.maxWidth, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <a href="/" style={navBtn({ textDecoration: "none" })}>
          ← Back
        </a>

        <a href={`/roster/edit?returnTo=${encodeURIComponent(returnTo)}`} style={navBtn({ textDecoration: "none" })}>
          + Add / Update
        </a>
      </div>

      <h1 style={{ fontSize: 34, fontWeight: UI.fontWeight.strong, marginBottom: 8 }}>Roster Management</h1>

      {optionsErrorMsg ? (
        <div style={{ padding: 14, border: "1px solid #ff6b6b", borderRadius: PAGE.card.radius, marginTop: 12 }}>
          <strong>Supabase error (loading filter options):</strong> {optionsErrorMsg}
        </div>
      ) : null}

      <Filters divisions={divisions} regions={regions} companies={companies} itgSupervisors={itgSupervisors} />

      <div style={{ marginTop: 18 }}>
        {errorMsg ? (
          <div style={{ padding: 14, border: "1px solid #ff6b6b", borderRadius: PAGE.card.radius }}>
            <strong>Supabase error (loading roster rows):</strong> {errorMsg}
          </div>
        ) : (
          <>
            <div
              style={{
                marginBottom: 10,
                opacity: 0.85,
                fontWeight: UI.fontWeight.strong,
                fontSize: UI.fontSize.body,
              }}
            >
              Showing {rows.length} rows
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((r) => (
                <div
                  key={r.roster_id}
                  style={{
                    padding: PAGE.card.padding,
                    border: PAGE.card.border,
                    borderRadius: PAGE.card.radius,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    {/* Left: Name/Tech + Details pill inline */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                        <div style={{ fontWeight: UI.fontWeight.bold, fontSize: UI.fontSize.primary, lineHeight: 1.2 }}>
                          {r.full_name ?? "(no name)"}{" "}
                          <span style={{ opacity: 0.7, fontWeight: UI.fontWeight.strong }}>
                            {r.tech_id ? `• Tech ${r.tech_id}` : ""}
                          </span>
                        </div>

                        <details>
                          <summary style={pillBase({ cursor: "pointer", userSelect: "none" })}>Details</summary>

                          <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: UI.fontSize.body, opacity: 0.9 }}>
                            <div>
                              <strong>Window:</strong> {r.start_date ?? "—"} → {r.end_date ?? "open"}
                            </div>
                            <div>
                              <strong>Insight Person ID:</strong> {r.insight_person_id ?? "—"}
                            </div>
                            <div>
                              <strong>Company:</strong> {r.company ?? "—"}
                            </div>
                            <div>
                              <strong>ITG Supervisor:</strong> {r.itg_supervisor ?? "—"}
                            </div>
                            <div>
                              <strong>Org:</strong> {r.division ?? "—"} / {r.region ?? "—"} / {r.pc ?? "—"}
                            </div>
                          </div>
                        </details>
                      </div>
                    </div>

                    {/* Right: View/Edit pill + Status pill */}
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      <a
                        href={`/roster/edit?roster_id=${encodeURIComponent(r.roster_id)}&returnTo=${encodeURIComponent(
                          returnTo
                        )}`}
                        style={pillBase({ textDecoration: "none", color: "inherit" })}
                      >
                        View / Edit
                      </a>

                      {(() => {
                        const isActive = !r.end_date;
                        return (
                          <span
                            style={pillBase({
                              color: isActive ? PAGE.statusText.active : PAGE.statusText.inactive,
                            })}
                          >
                            Status: {isActive ? "Active" : "Inactive"}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}

              {rows.length === 0 ? (
                <div style={{ padding: 14, border: PAGE.card.border, borderRadius: PAGE.card.radius, opacity: 0.9 }}>
                  No rows found for the current filters.
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
