// app/api/ingest/report-metric-config/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const TABLE = "ingest_report_settings_v1";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function asText(v: any, fallback = ""): string {
  const s = String(v ?? "").trim();
  return s || fallback;
}

function asNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * GET /api/ingest/report-metric-config?scope=global&source_system=ontrac
 */
export async function GET(req: Request) {
  const sb = supabaseAdmin();

  try {
    const { searchParams } = new URL(req.url);
    const scope = asText(searchParams.get("scope"), "global");
    const source_system = asText(searchParams.get("source_system"), "ontrac");

    const { data, error } = await sb
      .from(TABLE)
      .select("metric_name, report_label, p4p_enabled, p4p_weight, other_enabled, other_weight, format, updated_at")
      .eq("scope", scope)
      .eq("source_system", source_system)
      .order("metric_name", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const rows = (data ?? []) as any[];

    const p4p = rows
      .filter((r) => !!r.p4p_enabled)
      .map((r) => ({
        metric_name: String(r.metric_name),
        report_label: String(r.report_label ?? r.metric_name),
        weight: asNum(r.p4p_weight),
        format: r.format === "percent" ? "percent" : "number",
      }))
      .sort((a, b) => a.metric_name.localeCompare(b.metric_name));

    const other = rows
      .filter((r) => !!r.other_enabled)
      .map((r) => ({
        metric_name: String(r.metric_name),
        report_label: String(r.report_label ?? r.metric_name),
        weight: asNum(r.other_weight),
        format: r.format === "percent" ? "percent" : "number",
      }))
      .sort((a, b) => a.metric_name.localeCompare(b.metric_name));

    const p4p_weight_sum = p4p.reduce((acc, x) => acc + (Number.isFinite(x.weight) ? x.weight : 0), 0);
    const other_weight_sum = other.reduce((acc, x) => acc + (Number.isFinite(x.weight) ? x.weight : 0), 0);

    const updated_at =
      rows.reduce<string | null>((max, r) => {
        const v = r?.updated_at ? String(r.updated_at) : null;
        if (!v) return max;
        if (!max) return v;
        return v > max ? v : max;
      }, null) ?? null;

    return NextResponse.json({
      ok: true,
      scope,
      source_system,
      p4p,
      other,
      meta: {
        counts: { total: rows.length, p4p: p4p.length, other: other.length },
        weight_sums: { p4p: p4p_weight_sum, other: other_weight_sum },
        updated_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "report-metric-config GET failed" }, { status: 500 });
  }
}
