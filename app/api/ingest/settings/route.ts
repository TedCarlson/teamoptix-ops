// app/api/ingest/settings/route.ts
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

function asBool(v: any): boolean {
  return !!v;
}

function asNum(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asFormat(v: any): "number" | "percent" {
  return v === "percent" ? "percent" : "number";
}

function badRequest(msg: string) {
  return NextResponse.json({ ok: false, error: msg }, { status: 400 });
}

/**
 * GET /api/ingest/settings?scope=global&source_system=ontrac
 * Returns rows from DB as the UI source-of-truth.
 */
export async function GET(req: Request) {
  const sb = supabaseAdmin();

  try {
    const { searchParams } = new URL(req.url);
    const scope = asText(searchParams.get("scope"), "global");
    const source_system = asText(searchParams.get("source_system"), "ontrac");

    const { data, error } = await sb
      .from(TABLE)
      .select(
        "scope, source_system, metric_name, report_label, p4p_enabled, p4p_weight, other_enabled, other_weight, format, updated_at"
      )
      .eq("scope", scope)
      .eq("source_system", source_system)
      .order("metric_name", { ascending: true });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      scope,
      source_system,
      rows: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Settings GET failed" }, { status: 500 });
  }
}

/**
 * POST /api/ingest/settings
 * Body: { scope, source_system, rows: [{ metric_name, report_label, p4p_enabled, p4p_weight, other_enabled, other_weight, format }] }
 *
 * Performs UPSERT on (scope, source_system, metric_name) and returns DB-verified rows.
 */
export async function POST(req: Request) {
  const sb = supabaseAdmin();

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return badRequest("Invalid JSON body.");

    const scope = asText(body.scope, "global");
    const source_system = asText(body.source_system, "ontrac");

    const rowsIn = body.rows;
    if (!Array.isArray(rowsIn)) return badRequest("Missing rows[] array.");

    // Normalize + validate
    const normalized = rowsIn
      .map((r: any) => {
        const metric_name = asText(r?.metric_name);
        if (!metric_name) return null;

        const report_label = asText(r?.report_label, metric_name);

        const p4p_enabled = asBool(r?.p4p_enabled);
        const other_enabled = asBool(r?.other_enabled);

        const p4p_weight = p4p_enabled ? asNum(r?.p4p_weight) : 0;
        const other_weight = other_enabled ? asNum(r?.other_weight) : 0;

        const format = asFormat(r?.format);

        return {
          scope,
          source_system,
          metric_name,
          report_label,
          p4p_enabled,
          p4p_weight,
          other_enabled,
          other_weight,
          format,
        };
      })
      .filter(Boolean) as any[];

    if (normalized.length === 0) return badRequest("rows[] contained no valid items (metric_name required).");

    // Upsert rows
    const { error: upErr } = await sb.from(TABLE).upsert(normalized, {
      onConflict: "scope,source_system,metric_name",
    });

    if (upErr) {
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    // Return DB truth after upsert (UI can reload directly from this)
    const { data, error: selErr } = await sb
      .from(TABLE)
      .select(
        "scope, source_system, metric_name, report_label, p4p_enabled, p4p_weight, other_enabled, other_weight, format, updated_at"
      )
      .eq("scope", scope)
      .eq("source_system", source_system)
      .order("metric_name", { ascending: true });

    if (selErr) {
      return NextResponse.json(
        { ok: true, scope, source_system, updated: normalized.length, rows: [], warning: selErr.message },
        { status: 200 }
      );
    }

    return NextResponse.json({
      ok: true,
      scope,
      source_system,
      updated: normalized.length,
      rows: data ?? [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Settings POST failed" }, { status: 500 });
  }
}
