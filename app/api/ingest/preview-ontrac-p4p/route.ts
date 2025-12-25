// app/api/ingest/preview-ontrac-p4p/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const SETTINGS_TABLE = "ingest_report_settings_v1";
const RAW_VIEW = "ingest_raw_rows_with_anchor_v1";

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

function toNum(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;

  const s = String(v).trim();
  if (!s) return null;

  // Handle "12.3%" as 12.3
  const cleaned = s.endsWith("%") ? s.slice(0, -1) : s;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

type MetricCfg = {
  metric_name: string; // raw key
  report_label: string;
  weight: number;
  format: "number" | "percent";
};

/**
 * GET /api/ingest/preview-ontrac-p4p?batch_id=...&scope=global&source_system=ontrac
 *
 * Read-only sanity preview:
 * - pulls enabled P4P metrics from ingest_report_settings_v1
 * - reads raw rows via ingest_raw_rows_with_anchor_v1 (includes fiscal_month_anchor truth)
 * - produces simple per-tech averages (baseline, not final KPI definitions)
 */
export async function GET(req: Request) {
  const sb = supabaseAdmin();

  try {
    const { searchParams } = new URL(req.url);
    const batch_id = asText(searchParams.get("batch_id"));
    const scope = asText(searchParams.get("scope"), "global");
    const source_system = asText(searchParams.get("source_system"), "ontrac");

    if (!batch_id) {
      return NextResponse.json({ ok: false, error: "Missing batch_id" }, { status: 400 });
    }

    // 1) Load enabled P4P metric config from DB
    const { data: settings, error: sErr } = await sb
      .from(SETTINGS_TABLE)
      .select("metric_name, report_label, p4p_enabled, p4p_weight, format")
      .eq("scope", scope)
      .eq("source_system", source_system)
      .eq("p4p_enabled", true);

    if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

    const p4p: MetricCfg[] = (settings ?? []).map((r: any) => ({
      metric_name: String(r.metric_name),
      report_label: String(r.report_label ?? r.metric_name),
      weight: Number(r.p4p_weight ?? 0),
      format: r.format === "percent" ? "percent" : "number",
    }));

    if (!p4p.length) {
      return NextResponse.json({
        ok: true,
        scope,
        source_system,
        batch_id,
        fiscal_month_anchor: null,
        p4p: [],
        preview: [],
        meta: { rows_scanned: 0, techs: 0, note: "No P4P metrics enabled in settings." },
      });
    }

    // 2) Load raw rows via anchor-aware view
    const { data: rawRows, error: rErr } = await sb
      .from(RAW_VIEW)
      .select("row_num, raw, fiscal_month_anchor, upload_set_id")
      .eq("batch_id", batch_id)
      .limit(5000); // preview safety cap

    if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });

    const rows = (rawRows ?? []) as any[];
    const fiscal_month_anchor = rows[0]?.fiscal_month_anchor ?? null;
    const upload_set_id = rows[0]?.upload_set_id ?? null;

    // 3) Aggregate per TechId
    type Agg = {
      tech_id: string;
      tech_name: string;
      n_rows: number;
      sums: Record<string, number>;
      counts: Record<string, number>;
    };

    const byTech = new Map<string, Agg>();

    for (const rr of rows) {
      const raw = rr?.raw ?? {};
      const techId = asText(raw?.TechId);
      const techName = asText(raw?.TechName);
      const key = techId || techName || "UNKNOWN";

      let agg = byTech.get(key);
      if (!agg) {
        agg = {
          tech_id: techId || key,
          tech_name: techName || "",
          n_rows: 0,
          sums: {},
          counts: {},
        };
        byTech.set(key, agg);
      }

      agg.n_rows += 1;

      for (const m of p4p) {
        const v = toNum(raw?.[m.metric_name]);
        if (v == null) continue;
        agg.sums[m.metric_name] = (agg.sums[m.metric_name] ?? 0) + v;
        agg.counts[m.metric_name] = (agg.counts[m.metric_name] ?? 0) + 1;
      }
    }

    // 4) Preview = per-tech averages (baseline)
    const preview = Array.from(byTech.values())
      .map((a) => {
        const metrics: Record<string, { avg: number | null; n: number }> = {};
        for (const m of p4p) {
          const n = a.counts[m.metric_name] ?? 0;
          const avg = n > 0 ? a.sums[m.metric_name] / n : null;
          metrics[m.metric_name] = { avg, n };
        }
        return {
          tech_id: a.tech_id,
          tech_name: a.tech_name,
          n_rows: a.n_rows,
          metrics,
        };
      })
      .sort((x, y) => String(x.tech_id).localeCompare(String(y.tech_id)));

    return NextResponse.json({
      ok: true,
      scope,
      source_system,
      batch_id,
      upload_set_id,
      fiscal_month_anchor,
      p4p,
      preview,
      meta: {
        rows_scanned: rows.length,
        techs: preview.length,
        note:
          "Baseline preview: per-tech averages from raw rows. KPI definition rules (sum vs avg, rate handling, composites) come next.",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "preview-ontrac-p4p failed" }, { status: 500 });
  }
}
