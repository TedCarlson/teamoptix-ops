// app/api/ingest/undo/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Operational safety (Option B):
 * - Undo should rollback BOTH:
 *   1) DB rows (ingest_raw_rows_v1)
 *   2) Storage artifacts (manifest + jsonl under commit prefix)
 *
 * Canonical request identity from UI:
 * - upload_set_id (NOT the DB batch_id PK)
 */

const BUCKET = "ingest-ontrac-raw-v1";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

type UndoBody = {
  // Preferred:
  upload_set_id?: string | null;

  // Optional legacy/internal:
  batch_id?: string | null;

  // Optional (helps compute prefixes)
  fiscal_month_anchor?: string | null;

  // default: "commit"
  scope?: "commit" | "raw" | "all";
};

type IngestBatchRow = {
  batch_id: string;
  upload_set_id: string | null;
  source_system: string | null;
  fiscal_month_anchor: string | null;
  status: string | null;
  manifest_path: string | null;
  created_at?: string;
  updated_at?: string;
};

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Storage listing in Supabase is "folder-ish".
 * We recursively walk prefixes and collect file paths to remove.
 */
async function listAllFilesUnderPrefix(sb: ReturnType<typeof supabaseAdmin>, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const stack: string[] = [prefix];

  while (stack.length) {
    const cur = stack.pop()!;
    let offset = 0;

    // paginate defensively
    for (;;) {
      const { data, error } = await sb.storage.from(BUCKET).list(cur, { limit: 1000, offset });
      if (error) throw new Error(`Storage list failed at "${cur}": ${error.message}`);

      const items = (data ?? []) as any[];
      if (items.length === 0) break;

      for (const it of items) {
        const name = String(it?.name ?? "").trim();
        if (!name) continue;

        // Supabase list returns only "names" within the folder.
        // If it "looks like" a folder, recurse; otherwise treat as file.
        const looksFolder =
          // heuristic: no file extension and no slashes
          !name.includes(".") && !name.includes("/");

        const path = cur ? `${cur}/${name}` : name;

        if (looksFolder) {
          stack.push(path);
        } else {
          files.push(path);
        }
      }

      // if < limit, done
      if (items.length < 1000) break;
      offset += 1000;
    }
  }

  return files;
}

async function resolveBatch(sb: ReturnType<typeof supabaseAdmin>, body: UndoBody): Promise<IngestBatchRow> {
  const upload_set_id = String(body.upload_set_id ?? "").trim() || null;
  const batch_id = String(body.batch_id ?? "").trim() || null;

  // 1) Prefer upload_set_id (canonical UI identity)
  if (upload_set_id) {
    const { data, error } = await sb
      .from("ingest_batches_v1")
      .select("batch_id, upload_set_id, source_system, fiscal_month_anchor, status, manifest_path, created_at, updated_at")
      .eq("upload_set_id", upload_set_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Batch not found for upload_set_id=${upload_set_id}`);
    return data as IngestBatchRow;
  }

  // 2) Fall back to batch_id (DB PK)
  if (batch_id) {
    const { data, error } = await sb
      .from("ingest_batches_v1")
      .select("batch_id, upload_set_id, source_system, fiscal_month_anchor, status, manifest_path, created_at, updated_at")
      .eq("batch_id", batch_id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Batch not found for batch_id=${batch_id}`);
    return data as IngestBatchRow;
  }

  throw new Error("Missing upload_set_id or batch_id");
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();

  try {
    const body = (await req.json().catch(() => null)) as UndoBody | null;
    if (!body) return NextResponse.json({ ok: false, error: "Missing JSON body" }, { status: 400 });

    const scope = (body.scope ?? "commit") as UndoBody["scope"];

    const batch = await resolveBatch(sb, body);

    const upload_set_id = batch.upload_set_id;
    const fiscal_month_anchor = String(body.fiscal_month_anchor ?? batch.fiscal_month_anchor ?? "").trim() || null;
    const source_system = String(batch.source_system ?? "ontrac").trim() || "ontrac";

    // Compute commit_prefix:
    // Prefer manifest_path (authoritative), else compute standard path.
    // Expected manifest path format:
    //   ontrac_commits/<anchor>/<upload_set_id>/manifest.json
    let commit_prefix: string | null = null;
    if (batch.manifest_path) {
      const mp = batch.manifest_path.replace(/^\/+/, "");
      const idx = mp.lastIndexOf("/");
      commit_prefix = idx > 0 ? mp.slice(0, idx) : null; // drop manifest.json
    } else if (fiscal_month_anchor && upload_set_id) {
      commit_prefix = `${source_system}_commits/${fiscal_month_anchor}/${upload_set_id}`;
      // NOTE: your current system uses "ontrac_commits/...". If you keep that,
      // source_system is "ontrac" so it matches.
      // If you want EXACT match regardless of source naming, hardcode "ontrac_commits".
      if (source_system === "ontrac") {
        commit_prefix = `ontrac_commits/${fiscal_month_anchor}/${upload_set_id}`;
      }
    }

    // 1) DB delete (raw rows)
    let deletedRawRows = 0;
    if (scope === "raw" || scope === "commit" || scope === "all") {
      // count first (Supabase delete doesn't always return an affected count reliably)
      const { count: preCount, error: countErr } = await sb
        .from("ingest_raw_rows_v1")
        .select("*", { count: "exact", head: true })
        .eq("batch_id", batch.batch_id);

      if (countErr) throw new Error(countErr.message);

      const { error: delErr } = await sb.from("ingest_raw_rows_v1").delete().eq("batch_id", batch.batch_id);
      if (delErr) throw new Error(delErr.message);

      deletedRawRows = preCount ?? 0;
    }

    // 2) Storage cleanup (commit artifacts)
    let removedStorageObjects = 0;
    if ((scope === "commit" || scope === "all") && commit_prefix) {
      // Gather files under commit_prefix
      const files = await listAllFilesUnderPrefix(sb, commit_prefix);

      if (files.length) {
        // Delete in chunks to avoid API limits
        for (const c of chunk(files, 200)) {
          const { error: rmErr } = await sb.storage.from(BUCKET).remove(c);
          if (rmErr) throw new Error(`Storage remove failed: ${rmErr.message}`);
          removedStorageObjects += c.length;
        }
      }
    }

    // 3) Reset batch status + clear manifest_path
    const note = `Undo ${scope} at ${new Date().toISOString()} • removed_storage=${removedStorageObjects} • deleted_raw_rows=${deletedRawRows}`;
    const { error: updErr } = await sb
      .from("ingest_batches_v1")
      .update({
        status: "uploaded",
        manifest_path: null,
        note,
        updated_at: new Date().toISOString(),
      })
      .eq("batch_id", batch.batch_id);

    if (updErr) throw new Error(updErr.message);

    return NextResponse.json({
      ok: true,
      scope,
      batch_id: batch.batch_id,
      upload_set_id: batch.upload_set_id,
      fiscal_month_anchor: batch.fiscal_month_anchor,
      commit_prefix,
      deleted_raw_rows: deletedRawRows,
      removed_storage_objects: removedStorageObjects,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Undo failed" }, { status: 500 });
  }
}
