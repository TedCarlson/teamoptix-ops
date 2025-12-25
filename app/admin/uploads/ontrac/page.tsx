// app/admin/uploads/ontrac/page.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Robust fetch -> JSON helper
 * Fixes: "Unexpected token '<' ... is not valid JSON" by surfacing HTTP status + HTML snippet.
 */
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);

  // Always read as text first so we can gracefully handle HTML error pages/redirects/404s.
  const text = await res.text();
  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  const looksJson =
    contentType.includes("application/json") ||
    text.trim().startsWith("{") ||
    text.trim().startsWith("[");

  if (looksJson) {
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (e: any) {
      const snippet = text.slice(0, 240).replace(/\s+/g, " ").trim();
      throw new Error(`Invalid JSON from ${url}: HTTP ${res.status} ${res.statusText} • ${snippet}`);
    }

    if (!res.ok || (json && json.ok === false)) {
      throw new Error(json?.error || `HTTP ${res.status} ${res.statusText}`);
    }

    return json as T;
  }

  // Not JSON (often HTML). Give a small snippet to show what it is.
  const snippet = text.slice(0, 240).replace(/\s+/g, " ").trim();
  throw new Error(`Non-JSON response from ${url}: HTTP ${res.status} ${res.statusText} • ${snippet}`);
}

function fmtBytes(n: number) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function dedupeFiles(existing: File[], incoming: File[]) {
  const map = new Map<string, File>();
  for (const f of existing) map.set(`${f.name}::${f.size}::${f.lastModified}`, f);
  for (const f of incoming) map.set(`${f.name}::${f.size}::${f.lastModified}`, f);
  return Array.from(map.values());
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

function normalizeForMatch(s: string) {
  return String(s ?? "")
    .toUpperCase()
    .replace(/\.[A-Z0-9]+$/i, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strict region detection for CSV preview:
 * - ONLY read from row 1 text
 * - ONLY match allowed region names (no filename guessing)
 */
const ALLOWED_REGIONS = ["Keystone", "Beltway", "Big South", "Florida", "Freedom", "New England"] as const;

function detectRegionFromRow1Strict(row1Text: string): string | null {
  const hay = normalizeForMatch(row1Text);
  for (const r of ALLOWED_REGIONS) {
    const token = normalizeForMatch(r);
    if (token && hay.includes(token)) return r;
  }
  return null;
}

// Filename region extraction for validation/dashboard
// e.g. "Big South Metrics 12132025 215722.xlsx" -> "Big South"
function extractRegionFromFilename(name: string): string | null {
  const hay = normalizeForMatch(name);
  for (const r of ALLOWED_REGIONS) {
    const token = normalizeForMatch(r);
    if (token && hay.includes(token)) return r;
  }
  return null;
}

/**
 * Superficial CSV row estimate:
 * - Remove empty lines
 * - Assume Ontrac-ish structure: row 1 = title/region string, row 2 = headers, row 3+ = data
 * - Filter obvious totals/footer rows by keyword patterns
 */
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

function looksLikeFooterLine(line: string) {
  const t = String(line ?? "").trim();
  if (!t) return true;

  const hay = normalizeForMatch(t);
  if (FOOTER_PATTERNS.some((p) => hay.includes(normalizeForMatch(p)))) return true;

  const cells = t.split(",").map((c) => c.trim()).filter(Boolean);
  if (cells.length <= 2) return true;

  return false;
}

type FilePreview =
  | { kind: "csv"; status: "loading" }
  | { kind: "csv"; status: "ready"; region: string | null; dataRowsEstimate: number; row1: string }
  | { kind: "xlsx"; status: "na"; note: string }
  | { kind: "other"; status: "na"; note: string }
  | { kind: "csv"; status: "error"; error: string };

function fileKey(f: File) {
  return `${f.name}::${f.size}::${f.lastModified}`;
}

/**
 * IMPORTANT:
 * In this UI, the canonical pipeline identifier is upload_set_id.
 * The DB has its own internal batch_id PK (different UUID). Do not alias them.
 */
type UploadResp = {
  ok: boolean;
  upload_set_id?: string; // canonical for UI + storage prefixes
  source_system?: string;
  fiscal_ref_date?: string;
  fiscal_month_anchor?: string;
  bucket?: string;
  counts?: { received: number; uploaded_ok: number; failed: number };
  files?: Array<{
    ok: boolean;
    original_filename: string;
    content_type: string;
    bytes: number;
    storage_path?: string;
    error?: string;
  }>;
  error?: string;
};

type ParseOntracResp = {
  ok: boolean;
  bucket: string;
  prefix: string;
  counts: { listed: number; parsed_ok: number; failed: number };
  files: Array<{
    ok: boolean;
    file: string;
    storage_path: string;
    sheetCount?: number;
    sheetNames?: string[];
    expectedHeaderFingerprint?: string;
    fileHeaderFingerprint?: string;
    headerMatch?: boolean;
    matchedSheetName?: string | null;
    row1Text?: string;
    headers?: string[];
    dataRowsEstimate?: number;
    error?: string;
  }>;
  error?: string;
};

type CommitResp = {
  ok: boolean;
  failed?: number;
  rows?: number;
  commit_prefix?: string;
  manifest?: string;
  error?: string;
};

type UndoResp = {
  ok: boolean;
  batch_id?: string; // DB PK (returned by undo route optionally)
  upload_set_id?: string | null;
  scope?: string;
  deleted_raw_rows?: number;
  removed_storage_objects?: number;
  commit_prefix?: string | null;
  error?: string;
};

type RegionsResp =
  | { ok: true; regions: Array<any> }
  | { ok: true; data: Array<any> }
  | { ok: true; items: Array<any> }
  | { ok: false; error: string };

type StepState = "idle" | "running" | "ok" | "warn" | "fail";

type PipelineState = {
  upload: StepState;
  parse: StepState;
  validate: StepState;
  commit: StepState;
};

const UPLOAD_URL = "/api/ingest/upload";
const PARSE_URL = "/api/ingest/parse-ontrac";
const REGIONS_URL = "/api/ref/regions";
const COMMIT_URL = "/api/ingest/commit-ontrac";
const UNDO_URL = "/api/ingest/undo";

export default function AdminUploadsOntracPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [isOver, setIsOver] = useState(false);

  // Shared batch input (applies to all files)
  // IMPORTANT: empty date must default to today
  const [fiscalRefDate, setFiscalRefDate] = useState<string>(isoTodayUTC()); // YYYY-MM-DD

  const totalBytes = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  const anchor = useMemo(() => {
    const chosen = (fiscalRefDate ?? "").trim();
    if (!chosen) return fiscalMonthAnchor(isoTodayUTC());
    return fiscalMonthAnchor(chosen);
  }, [fiscalRefDate]);

  const addFiles = useCallback((incoming: FileList | File[] | null | undefined) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    const filtered = arr.filter((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith(".csv") || name.endsWith(".xlsx");
    });
    setFiles((prev) => dedupeFiles(prev, filtered));
  }, []);

  const removeAt = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearAll = useCallback(() => setFiles([]), []);

  // ---- Preview stats (CSV-only) ----
  const [previews, setPreviews] = useState<Record<string, FilePreview>>({});

  useEffect(() => {
    let cancelled = false;

    async function buildPreviews() {
      const next: Record<string, FilePreview> = {};
      const existing = previews;

      for (const f of files) {
        const key = fileKey(f);
        const lower = f.name.toLowerCase();

        if (lower.endsWith(".xlsx")) {
          next[key] = { kind: "xlsx", status: "na", note: "Preview not available yet (XLSX)" };
          continue;
        }

        if (!lower.endsWith(".csv")) {
          next[key] = { kind: "other", status: "na", note: "Unsupported preview type" };
          continue;
        }

        const prev = existing[key];
        if (prev && prev.kind === "csv" && prev.status === "ready") {
          next[key] = prev;
          continue;
        }

        next[key] = { kind: "csv", status: "loading" };

        try {
          const text = await f.text();
          if (cancelled) return;

          const lines = text
            .split(/\r?\n/)
            .map((l) => l.replace(/\u0000/g, "").trim())
            .filter((l) => l.length > 0);

          const row1 = lines[0] ?? "";
          const region = row1 ? detectRegionFromRow1Strict(row1) : null;

          const dataLines = lines.slice(2);
          const filteredDataLines = dataLines.filter((ln) => !looksLikeFooterLine(ln));
          const dataRowsEstimate = Math.max(0, filteredDataLines.length);

          next[key] = { kind: "csv", status: "ready", region, dataRowsEstimate, row1 };
        } catch (e: any) {
          next[key] = { kind: "csv", status: "error", error: e?.message ?? "Preview failed" };
        }
      }

      if (!cancelled) setPreviews(next);
    }

    buildPreviews();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // ---- One-button pipeline state ----
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [pipeline, setPipeline] = useState<PipelineState>({
    upload: "idle",
    parse: "idle",
    validate: "idle",
    commit: "idle",
  });

  const [uploadResp, setUploadResp] = useState<UploadResp | null>(null);
  const [parseResp, setParseResp] = useState<ParseOntracResp | null>(null);
  const [commitResp, setCommitResp] = useState<CommitResp | null>(null);

  // stores *normalized* DB region names
  const [regionDbSet, setRegionDbSet] = useState<Set<string> | null>(null);

  const canProcess = useMemo(() => {
    return !!files.length && !busy && !!anchor;
  }, [files.length, busy, anchor]);

  function resetRun() {
    setErr(null);
    setUploadResp(null);
    setParseResp(null);
    setCommitResp(null);
    setPipeline({ upload: "idle", parse: "idle", validate: "idle", commit: "idle" });
  }

  function regionNameFromAny(x: any): string {
    if (typeof x === "string") return x.trim();
    if (!x || typeof x !== "object") return "";
    const candidates = [x.name, x.region, x.region_name, x.label, x.title, x.value];
    for (const c of candidates) {
      const s = String(c ?? "").trim();
      if (s) return s;
    }
    return "";
  }

  async function fetchRegionsSet(): Promise<Set<string>> {
    const json = await fetchJson<RegionsResp>(REGIONS_URL, { method: "GET" });

    const arr: any[] = (json as any).regions ?? (json as any).data ?? (json as any).items ?? [];
    const s = new Set<string>();

    for (const item of arr) {
      const name = regionNameFromAny(item);
      if (!name) continue;
      s.add(normalizeForMatch(name));
    }

    if (s.size === 0) {
      const sample = Array.isArray(arr) ? arr.slice(0, 3) : [];
      throw new Error(
        `Region ref list is empty/unreadable. Check ${REGIONS_URL} response shape. Sample items: ${JSON.stringify(sample)}`
      );
    }

    return s;
  }

  function stepIcon(s: StepState) {
    if (s === "ok") return "✅";
    if (s === "warn") return "⚠️";
    if (s === "fail") return "❌";
    if (s === "running") return "⏳";
    return "•";
  }

  async function doUndoLastCommit() {
    const upload_set_id = String(uploadResp?.upload_set_id ?? "").trim();
    if (!upload_set_id) {
      setErr("No upload_set_id available to undo.");
      return;
    }

    // Prefer saved anchor from upload response; fallback to computed anchor.
    const fiscal_month_anchor = String(uploadResp?.fiscal_month_anchor ?? anchor ?? "").trim();

    setBusy("Undoing…");
    setErr(null);

    try {
      // reflect activity in the UI (commit stage)
      setPipeline((p) => ({ ...p, commit: "running" }));

      const undoJson = await fetchJson<UndoResp>(UNDO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_set_id,
          fiscal_month_anchor,
          scope: "commit", // full undo
        }),
      });

      if (!undoJson.ok) throw new Error(undoJson.error || "Undo failed");

      // Clear commit result (it no longer applies)
      setCommitResp(null);

      // After undo, commit is no longer "ok" — show idle.
      setPipeline((p) => ({ ...p, commit: "idle" }));

      setBusy(null);
    } catch (e: any) {
      setErr(e?.message ?? "Undo failed");
      setPipeline((p) => ({ ...p, commit: "fail" }));
      setBusy(null);
    }
  }

  async function doProcessBatch() {
    if (!canProcess) return;

    resetRun();
    setBusy("Processing…");
    setErr(null);

    try {
      // 0) effective date: empty -> today
      const effectiveRef = (fiscalRefDate ?? "").trim() || isoTodayUTC();
      const effectiveAnchor = fiscalMonthAnchor(effectiveRef);
      if (!effectiveAnchor) throw new Error("Invalid fiscal reference date.");

      // 1) Upload
      setPipeline((p) => ({ ...p, upload: "running" }));
      const fd = new FormData();
      fd.append("source_system", "ontrac");
      fd.append("fiscal_ref_date", effectiveRef);
      for (const f of files) fd.append("files[]", f);

      const upJson = await fetchJson<UploadResp>(UPLOAD_URL, { method: "POST", body: fd });

      const upload_set_id = String(upJson.upload_set_id ?? "").trim();
      if (!upload_set_id) throw new Error("Upload succeeded but upload_set_id missing.");

      setUploadResp(upJson);
      setPipeline((p) => ({ ...p, upload: "ok" }));

      // 2) Parse
      setPipeline((p) => ({ ...p, parse: "running" }));
      const parseJson = await fetchJson<ParseOntracResp>(PARSE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_set_id,
          fiscal_month_anchor: effectiveAnchor,
        }),
      });

      setParseResp(parseJson);
      setPipeline((p) => ({ ...p, parse: "ok" }));

      // 3) Validate (green gating)
      setPipeline((p) => ({ ...p, validate: "running" }));

      const dbRegions = await fetchRegionsSet();
      setRegionDbSet(dbRegions);

      const perFile = (parseJson.files ?? []).map((f) => {
        const region = extractRegionFromFilename(f.file);
        const regionOk = region ? dbRegions.has(normalizeForMatch(region)) : false;
        const headerOk = !!f.headerMatch;
        return { file: f.file, region, regionOk, headerOk, ok: regionOk && headerOk };
      });

      const anyHeaderFail = perFile.some((x) => !x.headerOk);
      const anyRegionFail = perFile.some((x) => !x.regionOk);
      const allGreen = perFile.every((x) => x.ok);

      if (anyHeaderFail) {
        setPipeline((p) => ({ ...p, validate: "fail", commit: "idle" }));
        const bad = perFile.filter((x) => !x.headerOk).map((x) => x.file);
        throw new Error(`Validation failed: header mismatch in: ${bad.join(", ")}`);
      }

      if (anyRegionFail) {
        setPipeline((p) => ({ ...p, validate: "warn", commit: "idle" }));
        const bad = perFile
          .filter((x) => !x.regionOk)
          .map((x) => `${x.file} (region: ${x.region ?? "NOT FOUND"})`);
        throw new Error(`Validation not green: region not found in DB for: ${bad.join(", ")}`);
      }

      if (!allGreen) {
        setPipeline((p) => ({ ...p, validate: "warn", commit: "idle" }));
        throw new Error("Validation not green.");
      }

      setPipeline((p) => ({ ...p, validate: "ok" }));

      // 4) Commit (auto only on green)
      setPipeline((p) => ({ ...p, commit: "running" }));

      const commitJson = await fetchJson<CommitResp>(COMMIT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_set_id,
          fiscal_month_anchor: effectiveAnchor,
        }),
      });

      setCommitResp(commitJson);
      setPipeline((p) => ({ ...p, commit: "ok" }));
      setBusy(null);
    } catch (e: any) {
      setErr(e?.message ?? "Process failed");
      setPipeline((p) => {
        const next = { ...p };
        for (const k of ["upload", "parse", "validate", "commit"] as const) {
          if (next[k] === "running") next[k] = "fail";
        }
        return next;
      });
      setBusy(null);
    }
  }

  const uploadedOkCount = uploadResp?.files?.filter((f) => f.ok).length ?? 0;
  const uploadedFailCount = uploadResp?.files?.filter((f) => !f.ok).length ?? 0;

  const parsedOkCount = parseResp?.files?.filter((f) => f.ok).length ?? 0;
  const parsedFailCount = parseResp?.files?.filter((f) => !f.ok).length ?? 0;

  const totalRowsEstimate = useMemo(() => {
    const arr = parseResp?.files ?? [];
    let sum = 0;
    for (const f of arr) sum += Number(f.dataRowsEstimate ?? 0);
    return sum;
  }, [parseResp]);

  const canUndo = useMemo(() => {
    // Only enable after a successful commit, and we must have upload_set_id.
    return !busy && !!uploadResp?.upload_set_id && pipeline.commit === "ok";
  }, [busy, uploadResp?.upload_set_id, pipeline.commit]);

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Uploads: Ontrac</h1>
      <p style={{ marginTop: 10, opacity: 0.75 }}>One-button flow: Upload → Parse → Validate (green-gated) → Auto-Commit.</p>

      {/* Batch inputs */}
      <section style={{ marginTop: 12, padding: 16, borderRadius: 12, border: "1px solid rgba(0,0,0,0.18)" }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.75 }}>
          Batch inputs
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10, maxWidth: 560 }}>
          <label style={{ display: "grid", gap: 6 }}>
            Fiscal reference date (YYYY-MM-DD) <span style={{ fontSize: 12, opacity: 0.7 }}>(blank defaults to today)</span>
            <input
              type="date"
              value={fiscalRefDate}
              onChange={(e) => setFiscalRefDate(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid rgba(0,0,0,0.18)" }}
            />
          </label>

          <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.45 }}>
            Fiscal month anchor: <b>{anchor ?? "—"}</b>
            <div style={{ marginTop: 4 }}>Rule: day ≤ 21 → same month; day ≥ 22 → next month; anchor day = 21.</div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.75, lineHeight: 1.45 }}>
            CSV preview stats: region is detected <b>only</b> from row 1 text and must match allowed region names.
          </div>
        </div>
      </section>

      {/* Pipeline status */}
      <section style={{ marginTop: 12, padding: 14, borderRadius: 12, border: "1px solid rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Pipeline status</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>{busy ? busy : "Ready"}</div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13, opacity: 0.9 }}>
          <div>{stepIcon(pipeline.upload)} Upload</div>
          <div>{stepIcon(pipeline.parse)} Parse</div>
          <div>{stepIcon(pipeline.validate)} Validate (header + region-in-DB)</div>
          <div>{stepIcon(pipeline.commit)} Commit (auto only if validate is green)</div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            <b>Batch:</b> {files.length} file{files.length === 1 ? "" : "s"} • {fmtBytes(totalBytes)}
          </div>

          <button
            type="button"
            onClick={doUndoLastCommit}
            disabled={!canUndo}
            style={{
              marginLeft: "auto",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.18)",
              background: canUndo ? "transparent" : "rgba(0,0,0,0.03)",
              cursor: canUndo ? "pointer" : "not-allowed",
              fontWeight: 900,
            }}
            title={canUndo ? "Undo last committed batch" : "Undo available after a successful commit"}
          >
            Undo last commit
          </button>

          <button
            type="button"
            onClick={doProcessBatch}
            disabled={!canProcess}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.18)",
              background: canProcess ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.03)",
              cursor: canProcess ? "pointer" : "not-allowed",
              fontWeight: 900,
            }}
          >
            {busy ? busy : "Process Batch →"}
          </button>
        </div>

        {err ? (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(220, 60, 60, 0.6)" }}>
            <div style={{ fontWeight: 900 }}>Process halted</div>
            <div style={{ marginTop: 6, opacity: 0.9 }}>{err}</div>
          </div>
        ) : null}
      </section>

      {/* Results summary */}
      {uploadResp || parseResp || commitResp ? (
        <section style={{ marginTop: 12, padding: 14, borderRadius: 12, border: "1px solid rgba(0,0,0,0.18)" }}>
          <div style={{ fontWeight: 900 }}>Run summary</div>

          {uploadResp ? (
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, lineHeight: 1.45 }}>
              <div>
                upload_set_id: <b>{uploadResp.upload_set_id ?? "—"}</b>
              </div>
              <div>
                bucket: <b>{uploadResp.bucket}</b>
              </div>
              <div>
                anchor: <b>{uploadResp.fiscal_month_anchor}</b>
              </div>
              <div>
                upload ok: <b>{uploadedOkCount}</b> • failed: <b>{uploadedFailCount}</b>
              </div>
            </div>
          ) : null}

          {parseResp ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85, lineHeight: 1.45 }}>
              <div>
                parsed ok: <b>{parsedOkCount}</b> • failed: <b>{parsedFailCount}</b>
              </div>
              <div>
                estimated rows: <b>{totalRowsEstimate}</b>
              </div>
              <div>
                prefix: <code>{parseResp.prefix}</code>
              </div>
            </div>
          ) : null}

          {commitResp ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.9, lineHeight: 1.45 }}>
              <div>
                commit rows: <b>{commitResp.rows ?? "—"}</b>
              </div>
              <div>
                commit_prefix: <code>{commitResp.commit_prefix ?? "—"}</code>
              </div>
              <div>
                manifest: <code>{commitResp.manifest ?? "—"}</code>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Dropzone */}
      <section
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOver(false);
          addFiles(e.dataTransfer.files);
        }}
        style={{
          marginTop: 12,
          padding: 18,
          borderRadius: 16,
          border: "1px dashed rgba(0,0,0,0.45)",
          background: isOver ? "rgba(0,0,0,0.04)" : "transparent",
          transition: "background 120ms ease",
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 14 }}>Drag & drop files here</div>
        <div style={{ marginTop: 6, opacity: 0.85, fontSize: 12 }}>
          or click to choose <b>.csv</b> / <b>.xlsx</b> files (multi-select enabled)
        </div>

        <div style={{ marginTop: 12 }}>
          <label
            style={{
              display: "inline-block",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.18)",
              cursor: "pointer",
              fontWeight: 800,
              userSelect: "none",
            }}
          >
            Choose files…
            <input
              type="file"
              multiple
              accept=".csv,.xlsx"
              style={{ display: "none" }}
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>

          {files.length ? (
            <button
              type="button"
              onClick={clearAll}
              style={{
                marginLeft: 10,
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.18)",
                background: "transparent",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              Clear all
            </button>
          ) : null}
        </div>
      </section>

      {/* File list */}
      <section style={{ marginTop: 12, padding: 16, borderRadius: 12, border: "1px solid rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.75 }}>
            Selected files
          </div>

          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {files.length ? (
              <>
                {files.length} file{files.length === 1 ? "" : "s"} • {fmtBytes(totalBytes)}
              </>
            ) : (
              "None"
            )}
          </div>
        </div>

        {files.length ? (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {files.map((f, idx) => {
              const key = fileKey(f);
              const pv = previews[key];

              const regionFromName = extractRegionFromFilename(f.name);
              const regionInDb = regionDbSet ? (regionFromName ? regionDbSet.has(normalizeForMatch(regionFromName)) : false) : null;

              return (
                <div
                  key={key}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.12)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 260, flex: "1 1 360px" }}>
                    <div style={{ fontWeight: 850 }}>{f.name}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{fmtBytes(f.size)}</div>

                    <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85, lineHeight: 1.45 }}>
                      <div>
                        Region (filename): <b>{regionFromName ?? "NOT FOUND"}</b>{" "}
                        {regionDbSet ? (
                          <span style={{ opacity: 0.8 }}>
                            — DB: <b>{regionInDb ? "✅ match" : "❌ not found"}</b>
                          </span>
                        ) : (
                          <span style={{ opacity: 0.6 }}>— DB: (not checked yet)</span>
                        )}
                      </div>

                      {!pv ? null : pv.kind === "xlsx" ? (
                        <div style={{ marginTop: 6 }}>{pv.note}</div>
                      ) : pv.kind === "other" ? (
                        <div style={{ marginTop: 6 }}>{pv.note}</div>
                      ) : pv.kind === "csv" && pv.status === "loading" ? (
                        <div style={{ marginTop: 6 }}>Previewing CSV…</div>
                      ) : pv.kind === "csv" && pv.status === "error" ? (
                        <div style={{ marginTop: 6, opacity: 0.9 }}>Preview error: {pv.error}</div>
                      ) : pv.kind === "csv" && pv.status === "ready" ? (
                        <div style={{ marginTop: 6 }}>
                          CSV Row1 region: <b>{pv.region ?? "NOT FOUND"}</b> • Estimated rows: <b>{pv.dataRowsEstimate}</b>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeAt(idx)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(0,0,0,0.18)",
                      background: "transparent",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 14, opacity: 0.75 }}>Drop files above to begin.</div>
        )}
      </section>

      <div style={{ marginTop: 12 }}>
        <a
          href="/admin/uploads"
          style={{
            display: "inline-block",
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.18)",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          ← Back to Uploads
        </a>
      </div>
    </main>
  );
}
