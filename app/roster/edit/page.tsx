import RosterEditForm from "./RosterEditForm";
import { createClient } from "@supabase/supabase-js";

function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function RosterEditPage({
  searchParams,
}: {
  // Works whether Next passes an object or a Promise
  searchParams: SearchParams | Promise<SearchParams>;
}) {
  const sp = await Promise.resolve(searchParams);
  const rawReturnTo = sp.returnTo;
  const returnTo = Array.isArray(rawReturnTo) ? rawReturnTo[0] : rawReturnTo;
  const backHref = returnTo ? decodeURIComponent(returnTo) : "/roster";
  const raw = sp.roster_id;
  const roster_id = Array.isArray(raw) ? raw[0] : raw;

  // Default initial state for CREATE
  let initial: any = {
    division: null,
    region: null,
    pc: null,
    office: null,
    status: null,
    tech_id: null,
    full_name: null,
    company: null,
    c_code: null,
    itg_supervisor: null,
    supervisor: null,
    schedule_name: null,
    role: null,
    email: null,
    mobile_number: null,
    start_date: null,
    end_date: null,
    notes: null,
    roster_key: null,
    insight_person_id: null,
  };

  // EDIT: fetch row and prefill
  if (roster_id) {
    const { data, error } = await supabaseServer()
      .from("roster_v2")
      .select("*")
      .eq("roster_id", roster_id)
      .single();

    if (!error && data) {
      initial = data;
    }
  }

  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <a
        href={backHref}
        style={{
          display: "inline-block",
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid #ddd",
          textDecoration: "none",
          fontWeight: 800,
          marginBottom: 16,
        }}
      >
        ← Back
      </a>

      <h1 style={{ fontSize: 34, fontWeight: 900, marginBottom: 8 }}>
        Add / Update Roster Window
      </h1>

      <div style={{ opacity: 0.85, marginBottom: 18 }}>
  {roster_id ? <>Editing existing roster window</> : <>Create new roster window</>}
</div>


      <RosterEditForm initial={initial} />
    </main>
  );
}
