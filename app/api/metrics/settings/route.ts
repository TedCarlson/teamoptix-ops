import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

type SettingRow = {
  metric_name: string;
  label?: string | null;
  kpi_name?: string | null;
  enabled: boolean;
  weight: number;
  sort_order?: number | null;
  format?: "number" | "percent" | null;
  hidden?: boolean | null;
};

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") ?? "global";

  const { data, error } = await sb
    .from("kpi_metric_settings_v1")
    .select("metric_name,label,kpi_name,enabled,weight,sort_order,format,hidden,scope")
    .eq("scope", scope)
    .order("sort_order", { ascending: true })
    .order("kpi_name", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();

  try {
    const body = await req.json().catch(() => null);
    const scope = String(body?.scope ?? "global");
    const rows: SettingRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "Missing rows[]" }, { status: 400 });
    }

    const cleaned = rows
      .filter((r) => typeof r?.metric_name === "string" && r.metric_name.trim().length > 0)
      .map((r) => {
        const metric_name = r.metric_name.trim();

        const kpi_name = String(r.kpi_name ?? "").trim() || metric_name;
        const label = String(r.label ?? "").trim() || kpi_name;

        const weight = Number(r.weight);
        const sort_order = Number(r.sort_order ?? 100);

        return {
          scope,
          metric_name,
          label,
          kpi_name,
          enabled: !!r.enabled,
          hidden: !!r.hidden,
          weight: Number.isFinite(weight) ? weight : 0,
          sort_order: Number.isFinite(sort_order) ? sort_order : 100,
          format: r.format === "percent" ? "percent" : "number",
        };
      });

    // Prevent accidental enabling of hidden rows
    for (const r of cleaned) {
      if (r.hidden) {
        r.enabled = false;
        r.weight = 0;
      }
    }

    const { error } = await sb
      .from("kpi_metric_settings_v1")
      .upsert(cleaned, { onConflict: "scope,metric_name" });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, updated: cleaned.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
