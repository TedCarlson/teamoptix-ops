// app/api/ingest/upload/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const BUCKET = "ingest-ontrac-raw-v1";
const BATCH_TABLE = "ingest_batches_v1";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function isoTodayUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Fiscal month anchor rule:
// - If day <= 21: anchor = same month YYYY-MM-21
// - If day >= 22: anchor = next month YYYY-MM-21
function fiscalMonthAnchor(refIso: string) {
  const d = new Date(`${refIso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;

  const day = d.getUTCDate();
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth(); // 0-11

  if (day >= 22) {
    m += 1;
    if (m === 12) {
      m = 0;
      y += 1;
    }
  }

  const mm = String(m + 1).padStart(2, "0");
  return `${y}-${mm}-21`;
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();

  try {
    const form = await req.formData();

    const source_system = String(form.get("source_system") ?? "ontrac").trim() || "ontrac";
    const fiscal_ref_date = String(form.get("fiscal_ref_date") ?? "").trim() || isoTodayUTC();

    const anchor = fiscalMonthAnchor(fiscal_ref_date);
    if (!anchor) {
      return NextResponse.json({ ok: false, error: "Invalid fiscal_ref_date" }, { status: 400 });
    }

    // storage delimiter (stable across parse/commit)
    const upload_set_id = randomUUID();

    // Collect files
    const files = form.getAll("files[]").filter(Boolean) as File[];
    if (!files.length) {
      return NextResponse.json({ ok: false, error: "No files[] provided" }, { status: 400 });
    }

    const prefix = `${source_system}/${anchor}/${upload_set_id}`;

    // 1) Upload to storage
    const results: Array<{
      ok: boolean;
      original_filename: string;
      content_type: string;
      bytes: number;
      storage_path?: string;
      error?: string;
    }> = [];

    for (const f of files) {
      const name = String((f as any).name ?? "file").trim() || "file";
      const bytes = Number((f as any).size ?? 0) || 0;
      const contentType = String((f as any).type ?? "") || "application/octet-stream";

      const storage_path = `${prefix}/${name}`;

      try {
        const ab = await f.arrayBuffer();
        const { error: upErr } = await sb.storage.from(BUCKET).upload(storage_path, new Uint8Array(ab), {
          contentType,
          upsert: true,
        });

        if (upErr) {
          results.push({ ok: false, original_filename: name, content_type: contentType, bytes, error: upErr.message });
          continue;
        }

        results.push({ ok: true, original_filename: name, content_type: contentType, bytes, storage_path });
      } catch (e: any) {
        results.push({ ok: false, original_filename: name, content_type: contentType, bytes, error: e?.message || "Upload failed" });
      }
    }

    const uploaded_ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;

    // 2) Create/resolve DB batch immediately so UI always has batch_id
    const { data: batch, error: batchErr } = await sb
      .from(BATCH_TABLE)
      .upsert(
        {
          upload_set_id,
          source_system,
          fiscal_ref_date,
          fiscal_month_anchor: anchor,
          status: "uploaded",
          storage_bucket: BUCKET,
          storage_prefix: prefix,
        },
        { onConflict: "upload_set_id" }
      )
      .select("batch_id")
      .single();

    if (batchErr || !batch?.batch_id) {
      return NextResponse.json(
        { ok: false, error: batchErr?.message || "Failed to create ingest batch record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,

      // ✅ canonical DB id
      batch_id: String(batch.batch_id),

      // ✅ storage delimiter (still useful for debugging)
      upload_set_id,

      source_system,
      fiscal_ref_date,
      fiscal_month_anchor: anchor,
      bucket: BUCKET,
      counts: { received: files.length, uploaded_ok, failed },
      files: results,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Upload failed" }, { status: 500 });
  }
}
