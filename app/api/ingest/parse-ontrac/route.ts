import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const BUCKET = "ingest-ontrac-raw-v1";

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizeForMatch(s: string) {
  return String(s ?? "")
    .toUpperCase()
    .replace(/\.[A-Z0-9]+$/i, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const FOOTER_PATTERNS = [
  "GRAND TOTAL",
  "SUBTOTAL",
  "SUB TOTAL",
  "TOTALS",
  "TOTAL",
  "SUMMARY",
  "END OF REPORT",
  "REPORT TOTAL",
  "PAGE ",
];

function looksLikeFooterRowText(rowText: string) {
  const hay = normalizeForMatch(rowText);
  if (!hay) return true;
  if (FOOTER_PATTERNS.some((p) => hay.includes(normalizeForMatch(p)))) return true;

  // Heuristic: footer rows often have very few meaningful tokens
  const tokens = hay.split(" ").filter(Boolean);
  if (tokens.length <= 2) return true;

  return false;
}

function cellText(v: any) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object" && "text" in v) return String((v as any).text ?? "").trim();
  return String(v).trim();
}

function getRowTexts(row: ExcelJS.Row) {
  // Row.values is 1-indexed; index 0 is unused
  const vals = (row.values as any[]) ?? [];
  return vals
    .slice(1)
    .map(cellText)
    .map((s) => s.replace(/\u0000/g, "").trim());
}

// ------------------------------
// Ontrac header fingerprint (do not rename headers)
// ------------------------------
const EXPECTED_ONTRAC_HEADERS = [
  "TechId",
  "TechName",
  "Supervisor",
  "Total Jobs",
  "Installs",
  "TCs",
  "SROs",
  "TUResult",
  "TUEligibleJobs",
  "ToolUsage",
  "Promoters",
  "Detractors",
  "tNPS Surveys",
  "tNPS Rate",
  "FTRFailJobs",
  "Total FTR/Contact Jobs",
  "FTR%",
  "48Hr Contact Orders",
  "48Hr Contact Rate%",
  "PHT Jobs",
  "PHT Pure Pass",
  "PHT Fails",
  "PHT RTM",
  "PHT Pass%",
  "PHT Pure Pass%",
  "TotalAppts",
  "TotalMetAppts",
  "MetRate",
  "Rework Count",
  "Rework Rate%",
  "SOI Count",
  "SOI Rate%",
  "Repeat Count",
  "Repeat Rate%",
];

function normHeader(h: string) {
  return String(h ?? "")
    .replace(/\u00A0/g, " ") // NBSP -> space
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function fingerprint(headers: string[]) {
  return headers.map(normHeader).filter(Boolean).join("|");
}

const EXPECTED_FP = fingerprint(EXPECTED_ONTRAC_HEADERS);

function headersFromRow2(ws: ExcelJS.Worksheet) {
  const row2 = ws.getRow(2);
  return getRowTexts(row2)
    .map((h) => h.trim())
    .filter((h) => h.length > 0);
}

function pickMatchingSheet(wb: ExcelJS.Workbook) {
  for (const ws of wb.worksheets ?? []) {
    const hdrs = headersFromRow2(ws);
    const fp = fingerprint(hdrs);
    if (fp === EXPECTED_FP) {
      return { ws, headers: hdrs, fp, matched: true };
    }
  }

  // No match found; fall back to first worksheet for visibility (but mark mismatch)
  const ws = wb.worksheets?.[0] ?? null;
  if (!ws) return { ws: null, headers: [] as string[], fp: "", matched: false };

  const hdrs = headersFromRow2(ws);
  return { ws, headers: hdrs, fp: fingerprint(hdrs), matched: false };
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();

  try {
    const body = await req.json().catch(() => null);

    const upload_set_id: string | null = body?.upload_set_id ?? null;
    const fiscal_month_anchor: string | null = body?.fiscal_month_anchor ?? null;

    if (!upload_set_id || !fiscal_month_anchor) {
      return NextResponse.json(
        { ok: false, error: "Missing upload_set_id or fiscal_month_anchor" },
        { status: 400 }
      );
    }

    const prefix = `ontrac/${fiscal_month_anchor}/${upload_set_id}`;

    // List all files in this batch folder
    const { data: listed, error: listErr } = await sb.storage
      .from(BUCKET)
      .list(prefix, { limit: 200 });

    if (listErr) {
      return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });
    }

    const objects = (listed ?? []).filter((x: any) => {
    const n = String(x?.name ?? "");
    if (!n) return false;
  // Ignore subfolders; we only care about files at this level
    if (n.includes("/")) return false;
    return true;
    });

    if (!objects.length) {
    return NextResponse.json(
     {
        ok: false,
        error: `No files found under ${prefix}/`,
        debug: { listedCount: (listed ?? []).length, listedNames: (listed ?? []).map((x: any) => x?.name) },
        },
        { status: 404 }
    );
    }

    const results: any[] = [];
    let okCount = 0;

    for (const obj of objects) {
      const name = obj.name as string;
      const path = `${prefix}/${name}`;
      const lower = name.toLowerCase();

      if (!lower.endsWith(".xlsx")) {
        results.push({
          ok: false,
          file: name,
          storage_path: path,
          error: "Not an .xlsx (parse-ontrac only handles .xlsx)",
        });
        continue;
      }

      // Download
      const { data: dl, error: dlErr } = await sb.storage.from(BUCKET).download(path);
      if (dlErr || !dl) {
        results.push({
          ok: false,
          file: name,
          storage_path: path,
          error: dlErr?.message || "Download failed",
        });
        continue;
      }

      const ab = await dl.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(new Uint8Array(ab)) as any);

      const sheetCount = wb.worksheets?.length ?? 0;
      const sheetNames = (wb.worksheets ?? []).map((s) => s.name);

      // Pick the worksheet whose Row2 headers match the Ontrac fingerprint (multi-sheet allowed)
const picked = pickMatchingSheet(wb);
const ws = picked.ws;

if (!ws) {
  results.push({
    ok: false,
    file: name,
    storage_path: path,
    sheetCount,
    sheetNames,
    error: "No worksheet found",
  });
  continue;
}

const row1 = ws.getRow(1);
const row1Text = getRowTexts(row1).filter(Boolean).join(" ").trim();
const headers = picked.headers;


      // Estimate data rows: row3+ with values, excluding obvious footer rows.
      let dataRowsEstimate = 0;
      for (let r = 3; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        if (!row.hasValues) continue;

        const cells = getRowTexts(row);
        const joined = cells.filter(Boolean).join(" ").trim();
        if (!joined) continue;

        if (looksLikeFooterRowText(joined)) continue;

        dataRowsEstimate += 1;
      }

      okCount += 1;
      results.push({
        ok: true,
        file: name,
        storage_path: path,
        sheetCount,
        sheetNames,
        expectedHeaderFingerprint: EXPECTED_FP,
        fileHeaderFingerprint: picked.fp,
        headerMatch: picked.matched,
        matchedSheetName: ws.name,
        row1Text,
        headers,
        dataRowsEstimate,
      });
    }

    return NextResponse.json({
      ok: okCount > 0,
      bucket: BUCKET,
      prefix,
      counts: {
        listed: objects.length,
        parsed_ok: okCount,
        failed: objects.length - okCount,
      },
      files: results,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Unknown parse error" }, { status: 500 });
  }
}
