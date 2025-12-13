import { supabase } from "@/lib/supabaseClient";
import Filters from "./Filters";

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

function uniqSorted(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function RosterPage({
  searchParams,
}: {
  searchParams: SearchParams | Promise<SearchParams>;
}) {
  const sp = await Promise.resolve(searchParams);

  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };

  const division = get("division");
  const region = get("region");
  const company = get("company");
  const itg_supervisor = get("itg_supervisor");
  const status = get("status");

  // Build current query string to preserve filters
  const qs = new URLSearchParams();
  if (division) qs.set("division", division);
  if (region) qs.set("region", region);
  if (company) qs.set("company", company);
  if (itg_supervisor) qs.set("itg_supervisor", itg_supervisor);
  if (status) qs.set("status", status);

  const returnTo = `/roster${qs.toString() ? `?${qs.toString()}` : ""}`;



// Load only the columns needed to build filter options

const opts = await supabase
  .from("roster_v2")
  .select("division, region, company, itg_supervisor");

const all = opts.data ?? [];

// Division options never depend on anything above them
const divisions = uniqSorted(all.map((r: any) => r.division));

// Regions depend on division
const regionPool = division
  ? all.filter((r: any) => (r.division ?? "").trim() === division)
  : all;
const regions = uniqSorted(regionPool.map((r: any) => r.region));

// Companies depend on division + region
const companyPool = all.filter((r: any) => {
  const dOk = !division || (r.division ?? "").trim() === division;
  const rOk = !region || (r.region ?? "").trim() === region;
  return dOk && rOk;
});
const companies = uniqSorted(companyPool.map((r: any) => r.company));

// ITG supervisors depend on division + region + company
const itgSupPool = all.filter((r: any) => {
  const dOk = !division || (r.division ?? "").trim() === division;
  const rOk = !region || (r.region ?? "").trim() === region;
  const cOk = !company || (r.company ?? "").trim() === company;
  return dOk && rOk && cOk;
});
const itgSupervisors = uniqSorted(itgSupPool.map((r: any) => r.itg_supervisor));



  // Pause until at least one filter is selected
  const hasAnyFilter =
  !!division ||
  !!region ||
  !!company ||
  !!itg_supervisor ||
  status === "active" ||
  status === "inactive";


  let rows: RosterRow[] = [];
  let errorMsg: string | null = null;

  if (hasAnyFilter) {
    let q = supabase
      .from("roster_v2")
      .select(
      "roster_id, insight_person_id, full_name, tech_id, division, region, pc, start_date, end_date, status, itg_supervisor, company"
      )
      .order("full_name", { ascending: true }); // no limit

   if (division) q = q.eq("division", division);
   if (region) q = q.eq("region", region);
   if (company) q = q.eq("company", company);
   if (itg_supervisor) q = q.eq("itg_supervisor", itg_supervisor);
   if (status === "active") q = q.eq("status", "Active");
   if (status === "inactive") q = q.eq("status", "Inactive");


    const { data, error } = await q;

    if (error) errorMsg = error.message;
    rows = (data ?? []) as RosterRow[];
  }

  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          ← Back
        </a>

        <a
          href={`/roster/edit?returnTo=${encodeURIComponent(returnTo)}`}
          style={{
            display: "inline-block",
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          + Add / Update
        </a>
      </div>

      <h1 style={{ fontSize: 34, fontWeight: 800, marginBottom: 8 }}>Roster Management</h1>

      <p style={{ fontSize: 16, opacity: 0.85 }}>
        Select a filter to load desired roster.
      </p>

     <Filters
  divisions={divisions}
  regions={regions}
  companies={companies}
  itgSupervisors={itgSupervisors}
/>



      <div style={{ marginTop: 18 }}>
        {!hasAnyFilter ? (
          <div style={{ padding: 14, border: "1px solid #ddd", borderRadius: 12, opacity: 0.9 }}>
            No filters selected yet.
          </div>
        ) : errorMsg ? (
          <div style={{ padding: 14, border: "1px solid #ff6b6b", borderRadius: 12 }}>
            <strong>Supabase error:</strong> {errorMsg}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10, opacity: 0.85, fontWeight: 700 }}>
              Showing {rows.length} rows
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {rows.map((r) => (
                <div key={r.roster_id} style={{ padding: 14, border: "1px solid #ddd", borderRadius: 12 }}>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>
                    {r.full_name ?? "(no name)"}{" "}
                    <span style={{ opacity: 0.7, fontWeight: 600 }}>
                      {r.tech_id ? `• Tech ${r.tech_id}` : ""}
                    </span>
                  </div>
                  <div style={{ opacity: 0.85, marginTop: 4 }}>
                    {r.division ?? "—"} / {r.region ?? "—"} / {r.pc ?? "—"}
                  </div>
                  <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
  <a
    href={`/roster/edit?roster_id=${encodeURIComponent(r.roster_id)}&returnTo=${encodeURIComponent(returnTo)}`}
    style={{
      display: "inline-block",
      padding: "8px 12px",
      borderRadius: 10,
      border: "1px solid #ddd",
      textDecoration: "none",
      fontWeight: 900,
    }}
  >
    View / Edit
  </a>

  <span style={{ fontSize: 13, opacity: 0.85 }}>
    Status: <strong>{r.status ?? "—"}</strong>
  </span>
</div>

<details style={{ marginTop: 10 }}>
  <summary style={{ cursor: "pointer", fontWeight: 800, opacity: 0.9 }}>
    Details
  </summary>

  <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13, opacity: 0.9 }}>
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
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
