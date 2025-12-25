// app/api/ingest/commit-ontrac/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const BUCKET = "ingest-ontrac-raw-v1";
const RAW_TABLE = "ingest_raw_rows_v1";
const BATCH_TABLE = "ingest_batches_v1";

// IMPORTANT: preserve raw header names exactly as in file
const EXPECTED_HEADERS = [
  "TechId","TechName","Supervisor","Total Jobs","Installs","TCs","SROs","TUResult","TUEligibleJobs",
  "ToolUsage","Promoters","Detractors","tNPS Surveys","tNPS Rate","FTRFailJobs","Total FTR/Contact Jobs","FTR%",
  "48Hr Contact Orders","48Hr Contact Rate%","PHT Jobs","PHT Pure Pass","PHT Fails","PHT RTM","PHT Pass%","PHT Pure Pass%",
  "TotalAppts","TotalMetAppts","MetRate","Rework Count","Rework Rate%","SOI Count","SOI Rate%","Repeat Count","Repeat Rate%",
] as const;

const ALLOWED_REGIONS = ["Keystone","Beltway","Big South","Florida","Freedom","New England"] as const;

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeForFingerprint(s: string) {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function fingerprint(headers: string[]) {
  return headers.map(normalizeForFingerprint).join("|");
}

function cellText(v: any) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object" && v && "text" in v) return String((v as any).text ?? "").trim();
  return String(v).trim();
}

function getRowTexts(row: ExcelJS.Row) {
  const vals = (row.values as any[]) ?? [];
  return vals.slice(1).map(cellText).map((s) => s.replace(/\u0000/g, "").trim());
}

function detectRegionFromRow1(row1Text: string): string | null {
  const hay = row1Text.toUpperCase();
  for (const r of ALLOWED_REGIONS) {
    if (hay.includes(r.toUpperCase())) return r;
  }
  return null;
}

function looksLikeFooter(joined: string) {
  const h = joined.toUpperCase();
  if (!h.trim()) return true;
  const patterns = ["GRAND TOTAL","SUBTOTAL","SUB TOTAL","TOTALS","TOTAL","SUMMARY","END OF REPORT","REPORT TOTAL","PAGE "];
  if (patterns.some((p) => h.includes(p))) return true;
  const tokens = joined.split(/\s+/).filter(Boolean);
  if (tokens.length <= 2) return true;
  return false;
}

async function insertInChunks(
  sb: ReturnType<typeof supabaseAdmin>,
  rows: any[],
  chunkSize = 500
) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb.from(RAW_TABLE).insert(chunk);
    if (error) throw new Error(`DB insert failed: ${error.message}`);
  }
}

type CommitResp = {
  ok: boolean;
  batch_id: string;
  upload_set_id: string;
  rows: number;
  commit_prefix: string;
  manifest: string;
  failed: number;
  files: any[];
};

export async function POST(req: Request) {
  const sb = supabaseAdmin();

  try {
    const body = await req.json().catch(() => null);

    // Accept either name; storage identity is upload_set_id
    const upload_set_id = String(body?.upload_set_id ?? body?.batch_id ?? "").trim();
    const fiscal_month_anchor = String(body?.fiscal_month_anchor ?? "").trim();

    if (!upload_set_id || !fiscal_month_anchor) {
      return NextResponse.json(
        { ok: false, error: "Missing upload_set_id (or batch_id alias) or fiscal_month_anchor" },
        { status: 400 }
      );
    }

    // 0) Resolve batch_id (DB identity) and mark committing
    const { data: batch, error: batchErr } = await sb
      .from(BATCH_TABLE)
      .upsert(
        {
          upload_set_id,
          source_system: "ontrac",
          fiscal_month_anchor,
          status: "committing",
        },
        { onConflict: "upload_set_id" }
      )
      .select("batch_id")
      .single();

    if (batchErr || !batch?.batch_id) {
      return NextResponse.json(
        { ok: false, error: batchErr?.message || "Failed to resolve ingest batch" },
        { status: 500 }
      );
    }

    const batch_id = String(batch.batch_id);

    // Storage prefixes (upload_set_id is the storage delimiter)
    const prefix = `ontrac/${fiscal_month_anchor}/${upload_set_id}`;
    const commit_prefix = `ontrac_commits/${fiscal_month_anchor}/${upload_set_id}`;

    // 1) List uploaded files
    const { data: listed, error: listErr } = await sb.storage.from(BUCKET).list(prefix, { limit: 500 });
    if (listErr) return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });

    const objects = (listed ?? []).filter((x: any) => {
      const n = String(x?.name ?? "");
      return n && !n.includes("/");
    });

    if (!objects.length) {
      return NextResponse.json({ ok: false, error: `No files found under ${prefix}/` }, { status: 404 });
    }

    // 2) Parse files -> build DB rows + write JSONL artifacts
    const expectedFP = fingerprint(Array.from(EXPECTED_HEADERS));
    const results: any[] = [];
    const dbRows: any[] = [];
    let totalRows = 0;

    for (const obj of objects) {
      const name = obj.name as string;
      const storage_path = `${prefix}/${name}`;
      const lower = name.toLowerCase();

      if (!lower.endsWith(".xlsx")) {
        results.push({ ok: false, file: name, storage_path, error: "Not an .xlsx (commit-ontrac expects .xlsx)" });
        continue;
      }

      const { data: dl, error: dlErr } = await sb.storage.from(BUCKET).download(storage_path);
      if (dlErr || !dl) {
        results.push({ ok: false, file: name, storage_path, error: dlErr?.message || "Download failed" });
        continue;
      }

      const ab = await dl.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(new Uint8Array(ab)) as any);

      const sheetCount = wb.worksheets?.length ?? 0;
      const sheetNames = (wb.worksheets ?? []).map((s) => s.name);

      // Find first sheet with matching headers
      let matchedSheet: ExcelJS.Worksheet | null = null;
      let matchedSheetName: string | null = null;
      let fileHeaders: string[] = [];

      for (const ws of wb.worksheets ?? []) {
        const row2 = ws.getRow(2);
        const headers = getRowTexts(row2).map((h) => h.trim()).filter((h) => h.length > 0);
        if (!headers.length) continue;
        if (fingerprint(headers) === expectedFP) {
          matchedSheet = ws;
          matchedSheetName = ws.name;
          fileHeaders = headers;
          break;
        }
      }

      if (!matchedSheet) {
        const ws0 = wb.worksheets?.[0] ?? null;
        const row2 = ws0 ? ws0.getRow(2) : null;
        const headers0 = row2 ? getRowTexts(row2).map((h) => h.trim()).filter((h) => h.length > 0) : [];
        results.push({
          ok: false,
          file: name,
          storage_path,
          sheetCount,
          sheetNames,
          expectedHeaderFingerprint: expectedFP,
          fileHeaderFingerprint: fingerprint(headers0),
          headerMatch: false,
          error: "Header fingerprint mismatch (no worksheet matched expected headers)",
        });
        continue;
      }

      const ws = matchedSheet;
      const row1Text = getRowTexts(ws.getRow(1)).filter(Boolean).join(" ").trim();
      const region = detectRegionFromRow1(row1Text);

      const rowsOutForJsonl: any[] = [];
      let fileRowCount = 0;

      for (let r = 3; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        if (!row.hasValues) continue;

        const texts = getRowTexts(row);
        const joined = texts.filter(Boolean).join(" ").trim();
        if (!joined) continue;
        if (looksLikeFooter(joined)) continue;

        const rec: Record<string, any> = {};
        for (let i = 0; i < fileHeaders.length; i++) {
          const h = fileHeaders[i];
          rec[h] = texts[i] ?? null;
        }

        // Artifact row (storage)
        rowsOutForJsonl.push({
          source_system: "ontrac",
          fiscal_month_anchor,
          region,
          row_num: r,
          raw: rec,
        });

        /**
         * ✅ DB row insert:
         * DO NOT include fiscal_month_anchor here unless ingest_raw_rows_v1 actually has the column.
         * We preserve fiscal_month_anchor as a batch truth in ingest_batches_v1,
         * and expose it for reporting via view ingest_raw_rows_with_anchor_v1.
         */
        // ✅ DB row insert: MUST match ingest_raw_rows_v1 columns exactly (including NOT NULL payload)
        const tech_id = String(rec["TechId"] ?? "").trim() || null;
        if (!tech_id) continue; // optional guardrail

        dbRows.push({
          batch_id,
          region: region ?? null,
          row_num: r,
          source_file: name,
          tech_id,

        // REQUIRED: ingest_raw_rows_v1.payload is NOT NULL
        // Store the row payload as JSON (keeps exact raw keys without schema explosion)
          payload: rec,
        });


        fileRowCount += 1;
      }

      // Upload JSONL artifact for this file
      const jsonl = rowsOutForJsonl.map((o) => JSON.stringify(o)).join("\n");
      const outPath = `${commit_prefix}/${name}.jsonl`;

      const { error: upErr } = await sb.storage.from(BUCKET).upload(outPath, new TextEncoder().encode(jsonl), {
        contentType: "application/x-ndjson",
        upsert: true,
      });

      if (upErr) {
        results.push({ ok: false, file: name, storage_path, error: `Commit upload failed: ${upErr.message}` });
        continue;
      }

      totalRows += fileRowCount;

      results.push({
        ok: true,
        file: name,
        storage_path,
        committed_path: outPath,
        sheetCount,
        sheetNames,
        matchedSheetName,
        expectedHeaderFingerprint: expectedFP,
        fileHeaderFingerprint: expectedFP,
        headerMatch: true,
        regionDetected: region ?? null,
        dataRows: fileRowCount,
      });
    }

    const okFiles = results.filter((r) => r.ok).length;
    const failedFiles = results.filter((r) => !r.ok).length;

    // 3) DB write: idempotent clear then insert
    const { error: delErr } = await sb.from(RAW_TABLE).delete().eq("batch_id", batch_id);
    if (delErr) throw new Error(`DB delete failed (pre-insert): ${delErr.message}`);

    if (dbRows.length > 0) {
      await insertInChunks(sb, dbRows, 500);
    }

    // 4) manifest.json artifact
    const manifest = {
      ok: failedFiles === 0 && okFiles > 0,
      batch_id,
      upload_set_id,
      fiscal_month_anchor,
      bucket: BUCKET,
      source_prefix: prefix,
      commit_prefix,
      counts: {
        listed: objects.length,
        committed_ok: okFiles,
        failed: failedFiles,
        total_rows: totalRows,
      },
      files: results,
      created_at: new Date().toISOString(),
    };

    const manifestPath = `${commit_prefix}/manifest.json`;
    await sb.storage.from(BUCKET).upload(manifestPath, new TextEncoder().encode(JSON.stringify(manifest, null, 2)), {
      contentType: "application/json",
      upsert: true,
    });

    // 5) Update batch pointers + status
    const finalStatus = manifest.ok ? "committed" : "committed_with_errors";

    const { error: updErr } = await sb
      .from(BATCH_TABLE)
      .update({
        status: finalStatus,
        storage_bucket: BUCKET,
        storage_prefix: prefix,
        manifest_path: manifestPath,
        note: failedFiles ? `${failedFiles} file(s) failed during commit` : null,
      })
      .eq("batch_id", batch_id);

    if (updErr) throw new Error(`Failed to update batch row: ${updErr.message}`);

    const resp: CommitResp = {
      ok: manifest.ok,
      batch_id,
      upload_set_id,
      rows: dbRows.length,
      commit_prefix,
      manifest: manifestPath,
      failed: failedFiles,
      files: results,
    };

    return NextResponse.json(resp);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown commit error" },
      { status: 500 }
    );
  }
}
