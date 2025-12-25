import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Band = "exceed" | "meet" | "needs_improvement" | "unacceptable" | "no_data";
type ColorToken =
  | "accent_positive"
  | "accent_neutral"
  | "accent_warning"
  | "accent_critical"
  | "accent_muted";

type CommitBand = {
  band: Band;
  min_value: number | null;
  max_value: number | null;
  inclusive_min: boolean;
  inclusive_max: boolean;
  color_token: ColorToken;
};

type CommitMetric = {
  metric_name: string;
  report_label_snapshot: string;
  format_snapshot: string;
  bands: CommitBand[];
};

type CommitRubricBody = {
  scope?: string; // default 'global'
  source_system?: string; // default 'ontrac'
  committed_by?: string | null;
  notes?: string | null;

  // If omitted: server uses "today"
  fiscal_reference_date?: string | null; // YYYY-MM-DD

  metrics: CommitMetric[];
};

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, service, { auth: { persistSession: false } });
}

// Fallback fiscal anchor: 1st day of calendar month.
// If you already have fiscal logic elsewhere, we can swap this to call it next.
function calendarMonthAnchor(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const mm = String(m).padStart(2, "0");
  return `${y}-${mm}-01`;
}

function assertValidBody(body: any): asserts body is CommitRubricBody {
  if (!body || typeof body !== "object") throw new Error("Body required");
  if (!Array.isArray(body.metrics)) throw new Error("metrics[] required");
  if (body.metrics.length === 0) throw new Error("metrics[] cannot be empty");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    assertValidBody(body);

    const scope = (body.scope ?? "global").trim();
    const source_system = (body.source_system ?? "ontrac").trim().toLowerCase();
    const committed_by = body.committed_by ?? null;
    const notes = body.notes ?? null;

    const todayISO = new Date().toISOString().slice(0, 10);
    const refISO = (body.fiscal_reference_date ?? todayISO).slice(0, 10);
    const fiscal_month_anchor = calendarMonthAnchor(refISO);

    const sb = supabaseAdmin();

    // NOTE: Supabase-js doesn't support multi-statement transactions directly.
    // We use RPC-free "best effort" with ordering + unique active index:
    // 1) deactivate existing active versions for month
    // 2) insert new version
    // If two commits race, unique index prevents two actives. We'll surface the error.
    const { error: deactivateErr } = await sb
      .from("ingest_rubric_versions_v1")
      .update({ active: false })
      .eq("scope", scope)
      .eq("source_system", source_system)
      .eq("fiscal_month_anchor", fiscal_month_anchor)
      .eq("active", true);

    if (deactivateErr) throw deactivateErr;

    const { data: versionRow, error: versionErr } = await sb
      .from("ingest_rubric_versions_v1")
      .insert({
        scope,
        source_system,
        fiscal_month_anchor,
        committed_by,
        notes,
        active: true,
      })
      .select("id, scope, source_system, fiscal_month_anchor, committed_at, active")
      .single();

    if (versionErr) throw versionErr;
    const rubric_version_id = versionRow.id;

    // Flatten all threshold rows
    const rows: any[] = [];
    for (const m of body.metrics) {
      if (!m?.metric_name) throw new Error("metric_name required");
      if (!Array.isArray(m.bands) || m.bands.length === 0) throw new Error(`bands[] required for ${m.metric_name}`);
      for (const b of m.bands) {
        rows.push({
          rubric_version_id,
          metric_name: m.metric_name,
          band: b.band,
          min_value: b.min_value,
          max_value: b.max_value,
          inclusive_min: b.inclusive_min,
          inclusive_max: b.inclusive_max,
          color_token: b.color_token,
          report_label_snapshot: m.report_label_snapshot,
          format_snapshot: m.format_snapshot,
        });
      }
    }

    const { error: insertErr } = await sb
      .from("ingest_rubric_thresholds_v1")
      .insert(rows);

    if (insertErr) throw insertErr;

    return NextResponse.json({
      ok: true,
      rubric_version: versionRow,
      inserted_threshold_rows: rows.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 400 }
    );
  }
}
