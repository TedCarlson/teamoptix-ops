import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const division_id = searchParams.get("division_id");
  const region_id = searchParams.get("region_id");
  const pc_id = searchParams.get("pc_id");

  const sb = supabase();

  // Always return top-level options
  const [{ data: divisions, error: divErr }, { data: companies, error: compErr }] =
    await Promise.all([
      sb.from("divisions_v2").select("division_id, division_name").order("division_name"),
      sb.from("companies_v2").select("company_id, company_name, c_code, is_primary").order("company_name"),
    ]);

  if (divErr) return NextResponse.json({ ok: false, error: divErr.message }, { status: 500 });
  if (compErr) return NextResponse.json({ ok: false, error: compErr.message }, { status: 500 });

  // Conditionally return dependent options
  let regions: any[] = [];
  let pcs: any[] = [];
  let offices: any[] = [];

  if (division_id) {
    const { data, error } = await sb
      .from("regions_v2")
      .select("region_id, region_name, division_id")
      .eq("division_id", division_id)
      .order("region_name");

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    regions = data ?? [];
  }

  if (region_id) {
    const { data, error } = await sb
      .from("pcs_v2")
      .select("pc_id, pc_name, region_id")
      .eq("region_id", region_id)
      .order("pc_name");

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    pcs = data ?? [];
  }

  if (pc_id) {
    const { data, error } = await sb
      .from("offices_v2")
      .select("office_id, office_name, pc_id")
      .eq("pc_id", pc_id)
      .order("office_name");

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    offices = data ?? [];
  }

  return NextResponse.json({
    ok: true,
    divisions: divisions ?? [],
    regions,
    pcs,
    offices,
    companies: companies ?? [],
  });
}
