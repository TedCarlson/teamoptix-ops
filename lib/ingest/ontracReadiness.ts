// lib/ingest/ontracReadiness.ts

export type OntracPreviewInput = {
  headers: string[];              // row 2 headers as-is (DO NOT rename)
  row1Text?: string | null;
  dataRowsEstimate?: number | null;

  sheetCount?: number | null;
  sheetNames?: string[] | null;
  matchedSheetName?: string | null;

  sourceSystem?: "ontrac" | string;
};

export type OntracReadinessResult = {
  commitReady: boolean;

  blockingReasons: string[];
  warnings: string[];

  // For UI icons / arrows
  ui: {
    overall: UiMark;
    region: UiMark;
    headers: UiMark;
    rows: UiMark;
  };

  signals: {
    headerCount: number;

    // rules-based
    requiredCount: number;
    requiredFoundCount: number;
    requiredMissing: string[];
    extras: string[];
    headerCoverageOk: boolean;

    // fingerprints (debug)
    requiredFingerprint: string;
    fileFingerprint: string;

    detectedRegion: string | null;

    sheetCount: number | null;
    sheetNames: string[] | null;
    matchedSheetName: string | null;

    dataRowsEstimate: number | null;
  };
};

export type UiMark = "ok" | "good" | "warn" | "bad";

/**
 * ✅ REQUIRED Ontrac headers
 * IMPORTANT: keep these EXACT (source truth). Do not "friendly label" here.
 */
export const ONTRAC_REQUIRED_HEADERS: readonly string[] = [
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
] as const;

/**
 * Rules:
 * - "At least" required headers must be present (extras allowed).
 * - Region signal: row1 strict detect (warning only unless you choose to block later).
 * - Rows: 0 rows is warning by default (configurable later).
 */
export function evaluateOntracFileReadiness(input: OntracPreviewInput): OntracReadinessResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  const headersRaw = Array.isArray(input.headers) ? input.headers : [];
  const headerCount = headersRaw.length;

  if (!headerCount) blockingReasons.push("No headers found (row 2 appears empty).");

  // --- Header coverage (AT LEAST required) ---
  const cov = computeHeaderCoverage(headersRaw, ONTRAC_REQUIRED_HEADERS);

  if (!cov.headerCoverageOk) {
    // This is the one you likely want to block commit for Ontrac.
    blockingReasons.push(`Missing required headers (${cov.requiredMissing.length}).`);
  }

  // --- Region signal (strict, row 1 only) ---
  const detectedRegion = input.row1Text ? detectRegionFromRow1Strict(input.row1Text) : null;
  if (!detectedRegion) {
    warnings.push("Region not detected from row 1 text (signal only).");
  }

  // --- Rows signal ---
  const dataRowsEstimate = numberOrNull(input.dataRowsEstimate);
  if (dataRowsEstimate !== null && dataRowsEstimate <= 0) {
    warnings.push("Estimated data rows is 0 (signal only).");
  }

  // --- Worksheet signals (no enforcement here) ---
  const sheetCount = numberOrNull(input.sheetCount);
  const sheetNames = Array.isArray(input.sheetNames) ? input.sheetNames : null;
  const matchedSheetName = input.matchedSheetName ?? null;

  // Overall readiness = no blockers
  const commitReady = blockingReasons.length === 0;

  // UI marks (you can render ✅ / 🟢↑ / ⚠️ / ❌)
  const headersMark: UiMark = cov.headerCoverageOk ? "good" : "bad";
  const regionMark: UiMark = detectedRegion ? "good" : "warn";
  const rowsMark: UiMark =
    dataRowsEstimate == null ? "warn" : dataRowsEstimate > 0 ? "good" : "warn";
  const overall: UiMark = commitReady ? "ok" : "bad";

  return {
    commitReady,
    blockingReasons,
    warnings,
    ui: {
      overall,
      region: regionMark,
      headers: headersMark,
      rows: rowsMark,
    },
    signals: {
      headerCount,

      requiredCount: cov.requiredCount,
      requiredFoundCount: cov.requiredFoundCount,
      requiredMissing: cov.requiredMissing,
      extras: cov.extras,
      headerCoverageOk: cov.headerCoverageOk,

      requiredFingerprint: cov.requiredFingerprint,
      fileFingerprint: cov.fileFingerprint,

      detectedRegion,

      sheetCount,
      sheetNames,
      matchedSheetName,

      dataRowsEstimate,
    },
  };
}

/* ------------------------- rules helpers (pure) ------------------------- */

type Coverage = {
  requiredCount: number;
  requiredFoundCount: number;
  requiredMissing: string[];
  extras: string[];
  headerCoverageOk: boolean;
  requiredFingerprint: string;
  fileFingerprint: string;
};

function computeHeaderCoverage(fileHeaders: string[], requiredHeaders: readonly string[]): Coverage {
  // Normalize for comparisons only; do not mutate original header strings.
  const norm = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  const fileNormSet = new Set(fileHeaders.map(norm).filter((x) => x.length > 0));
  const requiredNorm = requiredHeaders.map(norm);

  const requiredMissing: string[] = [];
  let requiredFoundCount = 0;

  for (let i = 0; i < requiredHeaders.length; i++) {
    const rNorm = requiredNorm[i];
    if (fileNormSet.has(rNorm)) requiredFoundCount += 1;
    else requiredMissing.push(requiredHeaders[i]); // keep EXACT source header
  }

  // Extras: file headers not in required set (kept as source header strings)
  const requiredNormSet = new Set(requiredNorm);
  const extras = fileHeaders
    .map((h) => String(h ?? "").trim())
    .filter((h) => h.length > 0)
    .filter((h) => !requiredNormSet.has(norm(h)));

  const headerCoverageOk = requiredMissing.length === 0;

  // Fingerprints: useful for debugging without enforcing exact equality.
  const requiredFingerprint = requiredHeaders.map((h) => norm(h)).join("|");
  const fileFingerprint = fileHeaders.map((h) => norm(h)).filter(Boolean).join("|");

  return {
    requiredCount: requiredHeaders.length,
    requiredFoundCount,
    requiredMissing,
    extras,
    headerCoverageOk,
    requiredFingerprint,
    fileFingerprint,
  };
}

/* ------------------------- general helpers (pure) ------------------------- */

function numberOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeForMatch(s: string) {
  return String(s ?? "")
    .toUpperCase()
    .replace(/\.[A-Z0-9]+$/i, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Strict: row 1 only, and only known region names (no guessing)
const ALLOWED_REGIONS = ["Keystone", "Beltway", "Big South", "Florida", "Freedom", "New England"] as const;

function detectRegionFromRow1Strict(row1Text: string): string | null {
  const hay = normalizeForMatch(row1Text);
  for (const r of ALLOWED_REGIONS) {
    const token = normalizeForMatch(r);
    if (token && hay.includes(token)) return r;
  }
  return null;
}
