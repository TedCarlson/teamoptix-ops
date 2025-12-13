import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "kpi-raw-v1";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, { auth: { persistSession: false } });
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Fiscal month anchor rule:
// - If day <= 21: anchor = same month YYYY-MM-21
// - If day >= 22: anchor = next month YYYY-MM-21
function fiscalMonthAnchor(refIso: string) {
  const d = new Date(`${refIso}T00:00:00Z`);
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
  try {
    const form = await req.formData();

    const file = form.get("file");
    const fiscal_ref_date = (form.get("fiscal_ref_date") as string | null) ?? null; // YYYY-MM-DD
    const source_system = (form.get("source_system") as string | null) ?? null;
    const region = (form.get("region") as string | null) ?? null;
    const batch_label = (form.get("batch_label") as string | null) ?? null;
    const batch_date = (form.get("batch_date") as string | null) ?? null; // YYYY-MM-DD
    const notes = (form.get("notes") as string | null) ?? null;


    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }

    const original_filename = file.name || "upload";
    const lower = original_filename.toLowerCase();
    const isCsv = lower.endsWith(".csv");
    const isXlsx = lower.endsWith(".xlsx");

    if (!isCsv && !isXlsx) {
      return NextResponse.json(
        { ok: false, error: "Unsupported file type. Upload .csv or .xlsx" },
        { status: 400 }
      );
    }

    const content_type =
      file.type ||
      (isCsv
        ? "text/csv"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    const sb = supabaseAdmin();

    const todayIso = isoDate(new Date());
    const refIso =
  (fiscal_ref_date && fiscal_ref_date.trim()) ||
  (batch_date && batch_date.trim()) ||
  todayIso;

    const fiscal_month_anchor = fiscalMonthAnchor(refIso);

    // 1) Insert batch row first so we can use batch_id in storage path
    const { data: batch, error: batchErr } = await sb
      .from("kpi_batches_v1")
      .insert({
        storage_bucket: BUCKET,
        fiscal_ref_date: refIso,
        fiscal_month_anchor,
        storage_path: "PENDING",
        original_filename,
        content_type,
        source_system,
        region: region && region.trim() ? region.trim() : null,
        batch_label,
        batch_date: batch_date && batch_date.trim() ? batch_date : null,
        notes,
        status: "uploaded",
        })

      .select("batch_id")
      .single();

    if (batchErr || !batch) {
      return NextResponse.json(
        { ok: false, error: batchErr?.message || "Failed to create batch" },
        { status: 500 }
      );
    }

    const batch_id = batch.batch_id as string;

    // 2) Upload raw file to Storage
    const bytes = new Uint8Array(await file.arrayBuffer());
    const storage_path = `${batch_id}/${safeFileName(original_filename)}`;

    const { error: upErr } = await sb.storage.from(BUCKET).upload(storage_path, bytes, {
      contentType: content_type,
      upsert: false,
    });

    if (upErr) {
      await sb.from("kpi_batches_v1").update({ status: "failed", error: upErr.message }).eq("batch_id", batch_id);
      return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
    }

    // 3) Update batch row with the final storage path
    const { error: updErr } = await sb
      .from("kpi_batches_v1")
      .update({ storage_path })
      .eq("batch_id", batch_id);

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      batch_id,
      storage_bucket: BUCKET,
      storage_path,
      original_filename,
      content_type,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
