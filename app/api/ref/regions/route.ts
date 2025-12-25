import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * GET /api/ref/regions
 * Returns canonical region names from regions_v2 (read-only).
 *
 * Response:
 * { ok: true, regions: string[] }
 */
export async function GET() {
  try {
    const sb = supabaseAdmin();

    // Try common column names without assuming schema beyond "regions_v2 exists"
    // We'll probe in order: region_name, name, region
    const probes: Array<{ cols: string; pick: (r: any) => string | null }> = [
      { cols: "region_name", pick: (r) => (r?.region_name ? String(r.region_name) : null) },
      { cols: "name", pick: (r) => (r?.name ? String(r.name) : null) },
      { cols: "region", pick: (r) => (r?.region ? String(r.region) : null) },
    ];

    for (const p of probes) {
      const { data, error } = await sb.from("regions_v2").select(p.cols);
      if (error) continue;

      const regions = (data ?? [])
        .map(p.pick)
        .filter((x): x is string => !!x)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // de-dupe + sort for stability
      const uniq = Array.from(new Set(regions)).sort((a, b) => a.localeCompare(b));

      if (uniq.length) {
        return NextResponse.json({ ok: true, regions: uniq });
      }
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not read canonical region column from regions_v2 (tried: region_name, name, region).",
      },
      { status: 500 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
