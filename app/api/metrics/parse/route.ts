import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { parse as parseCsv } from "csv-parse/sync";
import { Buffer } from "buffer";

// Force Node.js runtime (needed for Buffer + excel parsing stability)
export const runtime = "nodejs";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function canonHeader(h: any) {
  return String(h ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function toBuffer(data: ArrayBuffer) {
  return Buffer.from(new Uint8Array(data));
}

function isTruthy(s: any) {
  return typeof s === "string" ? s.trim().length > 0 : !!s;
}

/**
 * Heuristic filter to prevent "Totals / Summary / Footer" rows from being inserted.
 * Tune patterns if your vendor data can legitimately contain these words in normal rows.
 */
function looksLikeTotalsOrFooterRow(obj: Record<string, any>) {
  const vals = Object.values(obj)
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0);

  // empty row
  if (vals.length === 0) return true;

  const hay = vals.join(" ").toLowerCase();

  // Common footer/totals markers
  const footerPatterns = [
    "grand total",
    "subtotal",
    "sub total",
    "totals",
    "total",
    "summary",
    "end of report",
    "report total",
    "page ",
  ];

  if (footerPatterns.some((p) => hay.includes(p))) return true;

  // Often footer lines have very few populated fields (e.g., "TOTALS" in col 1)
  if (vals.length <= 2) return true;

  return false;
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();

  try {
    const body = await req.json().catch(() => null);
    const batch_id: string | null = body?.batch_id ?? null;

    if (!batch_id) {
      return NextResponse.json({ ok: false, error: "Missing batch_id" }, { status: 400 });
    }

    const { data: batch, error: batchErr } = await sb
      .from("kpi_batches_v1")
      .select(
        "batch_id, storage_bucket, storage_path, original_filename, content_type, region, fiscal_month_anchor"
      )
      .eq("batch_id", batch_id)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json(
        { ok: false, error: batchErr?.message || "Batch not found" },
        { status: 404 }
      );
    }

    const region = batch.region ?? null;
    const fiscal_month_anchor = batch.fiscal_month_anchor ?? null;
    const bucket = batch.storage_bucket;
    const path = batch.storage_path;
    const filename = batch.original_filename?.toLowerCase() ?? "";
    const contentType = batch.content_type?.toLowerCase() ?? "";

    const isCsv = filename.endsWith(".csv") || contentType.includes("text/csv");
    const isXlsx =
      filename.endsWith(".xlsx") ||
      contentType.includes("spreadsheet") ||
      contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

    if (!isCsv && !isXlsx) {
      return NextResponse.json(
        { ok: false, error: "Unsupported file type for parsing. Only .csv or .xlsx" },
        { status: 400 }
      );
    }

    const { data: dl, error: dlErr } = await sb.storage.from(bucket).download(path);
    if (dlErr || !dl) {
      return NextResponse.json(
        { ok: false, error: dlErr?.message || "Download failed" },
        { status: 500 }
      );
    }

    const ab = await dl.arrayBuffer();
    const buf = toBuffer(ab);

    // allow re-parse
    await sb.from("kpi_raw_rows_v1").delete().eq("batch_id", batch_id);

    let inserted = 0;

    // -----------------------------
    // CSV PARSING (OnTrac: row 1 = filename, row 2 = headers, row 3+ = data)
    // + filters totals/footer rows
    // -----------------------------
    if (isCsv) {
      const text = buf.toString("utf8");
      const records: string[][] = parseCsv(text, {
        relax_column_count: true,
        skip_empty_lines: true,
      });

      if (!records.length) {
        return NextResponse.json({ ok: false, error: "CSV appears empty" }, { status: 400 });
      }

      // Prefer row 2 as header (index 1). Fallback to row 1 (index 0) if row 2 is blank/non-header.
      const preferredHeaderIdx = records.length >= 2 ? 1 : 0;
      const preferredHeaders = (records[preferredHeaderIdx] ?? []).map(canonHeader);
      const hasPreferredHeaders = preferredHeaders.some((h) => isTruthy(h));

      const headerIdx = hasPreferredHeaders ? preferredHeaderIdx : 0;
      const headers = (records[headerIdx] ?? []).map(canonHeader);

      // Data starts right after the header row
      const dataStartIdx = headerIdx + 1;
      const rows = records.slice(dataStartIdx);

      const payload = rows
        .map((r, idx) => {
          const obj: Record<string, any> = {};
          headers.forEach((h, i) => {
            if (!isTruthy(h)) return;
            obj[h] = r[i] ?? null;
          });

          return {
            batch_id,
            // actual CSV line number (1-based)
            row_num: dataStartIdx + idx + 1,
            sheet_name: null,
            region,
            fiscal_month_anchor,
            raw: obj,
          };
        })
        .filter((x) => !looksLikeTotalsOrFooterRow(x.raw));

      const CHUNK = 500;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const chunk = payload.slice(i, i + CHUNK);
        const { error } = await sb.from("kpi_raw_rows_v1").insert(chunk);
        if (error) throw new Error(error.message);
        inserted += chunk.length;
      }
    }

    // -----------------------------
    // XLSX PARSING (OnTrac: row 1 = filename, row 2 = headers, row 3+ = data)
    // + filters totals/footer rows
    // -----------------------------
    if (isXlsx) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as any);

      const CHUNK = 300;
      let chunk: any[] = [];

      for (const ws of wb.worksheets) {
        // Prefer row 2 as headers; fallback to row 1 if row 2 has no meaningful headers
        const headerRow2 = ws.getRow(2);
        const headerValues2 = (headerRow2.values as any[]) ?? [];
        const headers2 = headerValues2.slice(1).map(canonHeader);
        const hasHeaders2 = headers2.some((h) => isTruthy(h));

        const headerRowNum = hasHeaders2 ? 2 : 1;
        const dataStartRow = headerRowNum + 1;

        const headerRow = ws.getRow(headerRowNum);
        const headerValues = (headerRow.values as any[]) ?? [];
        const headers = headerValues.slice(1).map(canonHeader);

        const hasAnyHeader = headers.some((h) => isTruthy(h));
        if (!hasAnyHeader) continue;

        for (let r = dataStartRow; r <= ws.rowCount; r++) {
          const row = ws.getRow(r);
          if (!row.hasValues) continue;

          const obj: Record<string, any> = {};
          headers.forEach((h, i) => {
            if (!isTruthy(h)) return;
            const cell = row.getCell(i + 1);
            const val = (cell.text ?? "").trim();
            obj[h] = val === "" ? null : val;
          });

          // Skip totals/footer-ish rows
          if (looksLikeTotalsOrFooterRow(obj)) continue;

          chunk.push({
            batch_id,
            row_num: r, // keep actual Excel row number
            sheet_name: ws.name,
            region,
            fiscal_month_anchor,
            raw: obj,
          });

          if (chunk.length >= CHUNK) {
            const { error } = await sb.from("kpi_raw_rows_v1").insert(chunk);
            if (error) throw new Error(error.message);
            inserted += chunk.length;
            chunk = [];
          }
        }
      }

      if (chunk.length) {
        const { error } = await sb.from("kpi_raw_rows_v1").insert(chunk);
        if (error) throw new Error(error.message);
        inserted += chunk.length;
      }
    }

    const { error: updErr } = await sb
      .from("kpi_batches_v1")
      .update({ status: "parsed", error: null })
      .eq("batch_id", batch_id);

    if (updErr) throw new Error(updErr.message);

    return NextResponse.json({ ok: true, batch_id, inserted });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}
