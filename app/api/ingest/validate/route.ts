import { NextResponse } from "next/server";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

/**
 * POST /api/ingest/validate
 * Multipart form-data:
 * - file: File (.csv or .xlsx)
 *
 * Rules enforced (for now):
 * - XLSX must have exactly 1 worksheet
 * - CSV is allowed (no worksheet concept)
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file" }, { status: 400 });
    }

    const name = (file.name || "").toLowerCase();
    const isCsv = name.endsWith(".csv");
    const isXlsx = name.endsWith(".xlsx");

    if (!isCsv && !isXlsx) {
      return NextResponse.json(
        { ok: false, error: "Unsupported file type. Only .csv or .xlsx" },
        { status: 400 }
      );
    }

    // CSV: this guardrail doesn't apply
    if (isCsv) {
      return NextResponse.json({ ok: true, kind: "csv", checks: { single_sheet: "n/a" } });
    }

    // XLSX: enforce single worksheet
    const ab = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(new Uint8Array(ab)) as any);

    // ExcelJS keeps worksheets in wb.worksheets
    const sheetCount = wb.worksheets?.length ?? 0;

    if (sheetCount !== 1) {
      return NextResponse.json(
        {
          ok: false,
          kind: "xlsx",
          error: `XLSX has ${sheetCount} worksheet(s). Only single-sheet files are allowed.`,
          meta: { sheetCount, sheetNames: (wb.worksheets ?? []).map((s) => s.name) },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      kind: "xlsx",
      checks: { single_sheet: "pass" },
      meta: { sheetCount: 1, sheetNames: [wb.worksheets[0].name] },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Unknown validate error" },
      { status: 500 }
    );
  }
}
