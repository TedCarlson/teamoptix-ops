import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, service, { auth: { persistSession: false } });
}

function calendarMonthAnchor(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const mm = String(m).padStart(2, "0");
  return `${y}-${mm}-01`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const scope = (searchParams.get("scope") || "global").trim();
    const source_system = (searchParams.get("source_system") || "ontrac").trim().toLowerCase();

    const todayISO = new Date().toISOString().slice(0, 10);
    const anchorParam = searchParams.get("anchor");
    const fiscal_month_anchor = anchorParam ? anchorParam.slice(0, 10) : calendarMonthAnchor(todayISO);

    const sb = sbAdmin();

    const { data: versions, error: vErr } = await sb
      .from("ingest_rubric_versions_v1")
      .select("id, scope, source_system, fiscal_month_anchor, committed_at, committed_by, notes, active")
      .eq("scope", scope)
      .eq("source_system", source_system)
      .eq("fiscal_month_anchor", fiscal_month_anchor)
      .order("id", { ascending: false });

    if (vErr) throw vErr;

    const list = versions ?? [];
    const active = list.find((v: any) => v.active) ?? list[0] ?? null;

    if (!active) {
      return NextResponse.json({
        ok: true,
        scope,
        source_system,
        fiscal_month_anchor,
        version: null,
        thresholds: [],
      });
    }

    const { data: thresholds, error: tErr } = await sb
      .from("ingest_rubric_thresholds_v1")
      .select(
        "metric_name, band, min_value, max_value, inclusive_min, inclusive_max, color_token, report_label_snapshot, format_snapshot"
      )
      .eq("rubric_version_id", active.id);

    if (tErr) throw tErr;

    return NextResponse.json({
      ok: true,
      scope,
      source_system,
      fiscal_month_anchor,
      version: active,
      thresholds: thresholds ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 400 });
  }
}
