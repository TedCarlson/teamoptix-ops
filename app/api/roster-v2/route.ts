import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon);
}

// Allowlist fields to prevent unintended writes
const WRITABLE_FIELDS = new Set([
  "division",
  "region",
  "pc",
  "office",
  "director",
  "regional_ops_manager",
  "pc_ops_manager",
  "status",
  "tech_id",
  "full_name",
  "company",
  "c_code",
  "itg_supervisor",
  "supervisor",
  "schedule_name",
  "role",
  "fuse_emp_id",
  "nt_login",
  "csgid",
  "email",
  "mobile_number",
  "preferred_off_days",
  "route_area",
  "preferred_fma",
  "skillset",
  "start_location",
  "start_date",
  "end_date",
  "last_updated",
  "notes",
  "roster_key",
  "insight_person_id",

  // keep imported_at writable ONLY if you intentionally want it:
  // "imported_at",
]);

function pickWritable(input: any) {
  const out: Record<string, any> = {};
  if (!input || typeof input !== "object") return out;

  for (const [k, v] of Object.entries(input)) {
    if (!WRITABLE_FIELDS.has(k)) continue;
    // normalize empty strings to null
    out[k] = v === "" ? null : v;
  }
  return out;
}

// READ: /api/roster-v2?roster_id=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roster_id = searchParams.get("roster_id");

  if (!roster_id) {
    return NextResponse.json({ ok: false, error: "Missing roster_id" }, { status: 400 });
  }

  const { data, error } = await supabase()
    .from("roster_v2")
    .select("*")
    .eq("roster_id", roster_id)
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

// CREATE
export async function POST(req: Request) {
  const body = await req.json();

  const payload = pickWritable(body);

  // If your DB default handles imported_at, do nothing.
  // If not, uncomment the next line:
  // payload.imported_at = payload.imported_at ?? new Date().toISOString();

  const { data, error } = await supabase()
    .from("roster_v2")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

// UPDATE
export async function PATCH(req: Request) {
  const body = await req.json();
  const roster_id = body?.roster_id;

  if (!roster_id) {
    return NextResponse.json({ ok: false, error: "Missing roster_id" }, { status: 400 });
  }

  const updates = pickWritable(body);

  // Prevent changing primary key through updates (extra safety)
  delete (updates as any).roster_id;

  const { data, error } = await supabase()
    .from("roster_v2")
    .update(updates)
    .eq("roster_id", roster_id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
