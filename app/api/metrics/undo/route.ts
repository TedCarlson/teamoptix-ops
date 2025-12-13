import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();

  try {
    const body = await req.json().catch(() => null);
    const batch_id: string | null = body?.batch_id ?? null;

    if (!batch_id) {
      return NextResponse.json({ ok: false, error: "Missing batch_id" }, { status: 400 });
    }

    // 1) load batch to find storage object
    const { data: batch, error: batchErr } = await sb
      .from("kpi_batches_v1")
      .select("batch_id, storage_bucket, storage_path")
      .eq("batch_id", batch_id)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json({ ok: false, error: batchErr?.message || "Batch not found" }, { status: 404 });
    }

    const bucket = batch.storage_bucket;
    const path = batch.storage_path;

    // 2) delete storage object (best effort)
    if (bucket && path && path !== "PENDING") {
      await sb.storage.from(bucket).remove([path]);
    }

    // 3) delete batch row
    // Cascades will delete:
    // - kpi_raw_rows_v1 (FK on delete cascade)
    // - kpi_master_v1 (FK on delete cascade)
    const { error: delErr } = await sb.from("kpi_batches_v1").delete().eq("batch_id", batch_id);
    if (delErr) throw new Error(delErr.message);

    return NextResponse.json({ ok: true, batch_id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
