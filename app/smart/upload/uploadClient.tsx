"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import UploadDropzone from "./UploadDropzone";

type UploadResp =
  | { ok: true; batch_id: string; storage_path: string; original_filename: string }
  | { ok: false; error: string };

type SimpleResp = { ok: boolean; error?: string; inserted?: number; batch_id?: string };

// MVP list — expand as needed.
// Codes are region codes that might appear in filenames or header strings.
const KNOWN_REGIONS: Array<{ name: string; codes: string[] }> = [
  { name: "Keystone", codes: ["KSR"] },
  { name: "Beltway", codes: ["BWR"] },
  { name: "Big South", codes: ["BSR"] },
  { name: "Florida", codes: ["FLR"] },
  { name: "Freedom", codes: ["FDR"] },
  { name: "New England", codes: ["NER"] },
];

function normalizeForMatch(s: string) {
  return String(s ?? "")
    .toUpperCase()
    .replace(/\.[A-Z0-9]+$/i, "") // remove extension
    .replace(/[^A-Z0-9]+/g, " ") // punctuation -> spaces
    .replace(/\s+/g, " ")
    .trim();
}

function detectRegionFromString(s: string): { region: string | null; why: string } {
  const hay = normalizeForMatch(s);

  // Prefer codes first (more precise)
  for (const r of KNOWN_REGIONS) {
    for (const code of r.codes) {
      const t = normalizeForMatch(code);
      if (t && hay.includes(t)) return { region: r.name, why: `matched code "${code}" in "${hay}"` };
    }
  }

  // Then match by region name
  for (const r of KNOWN_REGIONS) {
    const t = normalizeForMatch(r.name);
    if (t && hay.includes(t)) return { region: r.name, why: `matched name "${r.name}" in "${hay}"` };
  }

  return { region: null, why: `no match in "${hay}"` };
}

function makeBatchLabel(region: string, sourceSystem: string) {
  const r = (region ?? "").trim();
  const s = (sourceSystem ?? "").trim();
  if (!r && !s) return "";
  if (!r) return s;
  if (!s) return r;
  return `${r} ${s}`;
}

export default function MetricsUploadClient() {
  const [file, setFile] = useState<File | null>(null);

  const [sourceSystem, setSourceSystem] = useState("Ontrac");
  const [region, setRegion] = useState<string>(""); // ✅ default NULL-ish
  const [batchLabel, setBatchLabel] = useState("");
  const [fiscalRefDate, setFiscalRefDate] = useState<string>(""); // YYYY-MM-DD
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchDisplay, setBatchDisplay] = useState<string | null>(null);

  // show what the detector did (helps you debug why "not detected")
  const [stagingHint, setStagingHint] = useState<string>("");

  // Track whether the user has manually edited the batch label.
  // If they haven't, we keep it auto-synced to (Region + Source System).
  const labelTouchedRef = useRef(false);

  const canUpload = useMemo(() => !!file && !busy, [file, busy]);

  // remember last batch locally (helps “undo last” after refresh)
useEffect(() => {
  const savedId = localStorage.getItem("last_kpi_batch_id");
  if (savedId && !batchId) setBatchId(savedId);

  const savedDisp = localStorage.getItem("last_kpi_batch_display");
  if (savedDisp && !batchDisplay) setBatchDisplay(savedDisp);

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
  if (batchId) localStorage.setItem("last_kpi_batch_id", batchId);
}, [batchId]);

useEffect(() => {
  if (batchDisplay) localStorage.setItem("last_kpi_batch_display", batchDisplay);
}, [batchDisplay]);


  // Keep label auto-generated unless user edits it.
  useEffect(() => {
    if (labelTouchedRef.current) return;
    setBatchLabel(makeBatchLabel(region, sourceSystem));
  }, [region, sourceSystem]);

  function pickFile(f: File | null) {
    setErr(null);
    setStagingHint("");
    setFile(null);

    // ✅ force region to be re-staged every time a new file is selected
    setRegion("");

    if (!f) return;

    const lower = f.name.toLowerCase();
    const ok = lower.endsWith(".csv") || lower.endsWith(".xlsx");
    if (!ok) {
      setErr("Please upload a .csv or .xlsx file.");
      return;
    }

    // Staging auto-fill: try detect region from filename string
    const det = detectRegionFromString(f.name);
    setStagingHint(`Region detect: ${det.region ?? "NONE"} — ${det.why}`);

    if (det.region) {
      setRegion(det.region);
      if (!labelTouchedRef.current) setBatchLabel(makeBatchLabel(det.region, sourceSystem));
    } else {
      setErr("Region not detected from filename. Please select the correct Region before Upload.");
      if (!labelTouchedRef.current) setBatchLabel(makeBatchLabel("", sourceSystem));
    }

    setFile(f);
  }

  async function doUploadAll() {
    if (!file) return;

    // Hard guard: prevent accidental wrong-region commits.
    if (!region.trim()) {
      setErr("Region is required. Please select a Region before Upload.");
      return;
    }

    setErr(null);

    try {
      // 1) Upload
      setBusy("Uploading…");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source_system", sourceSystem);
      fd.append("region", region);
      if (batchLabel.trim()) fd.append("batch_label", batchLabel.trim());
      if (notes.trim()) fd.append("notes", notes.trim());
      if (fiscalRefDate.trim()) fd.append("fiscal_ref_date", fiscalRefDate.trim());

      const res1 = await fetch("/api/metrics/upload", { method: "POST", body: fd });
      const json1 = (await res1.json()) as UploadResp;
      if (!res1.ok || !json1.ok) throw new Error((json1 as any).error || "Upload failed");

      setBatchId(json1.batch_id);

      // 2) Parse
      setBusy("Parsing…");
      const res2 = await fetch("/api/metrics/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: json1.batch_id }),
      });
      const json2 = (await res2.json()) as SimpleResp;
      if (!res2.ok || !json2.ok) throw new Error(json2.error || "Parse failed");

      // 3) Commit
      setBusy("Committing…");
      const res3 = await fetch("/api/metrics/commit-ontrac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: json1.batch_id }),
      });
      const json3 = (await res3.json()) as SimpleResp;
      if (!res3.ok || !json3.ok) throw new Error(json3.error || "Commit failed");

      // ✅ reset staging after success (prevents collisions)
      setFile(null);
      setRegion("");
      setFiscalRefDate("");
      setNotes("");
      setStagingHint("");
      labelTouchedRef.current = false;
      setBatchLabel(makeBatchLabel("", sourceSystem));
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function doUndo() {
    if (!batchId) return;
    if (!confirm("Undo last upload? This deletes batch + staged rows + committed KPI rows + raw file.")) return;

    setErr(null);
    setBusy("Undoing…");
    try {
      const res = await fetch("/api/metrics/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const json = (await res.json()) as SimpleResp;
      if (!res.ok || !json.ok) throw new Error(json.error || "Undo failed");

      setBatchId(null);
      localStorage.removeItem("last_kpi_batch_id");
    } catch (e: any) {
      setErr(e?.message ?? "Undo failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {err && (
        <div style={{ padding: 12, border: "1px solid #ff6b6b", borderRadius: 12 }}>
          <strong>Error:</strong> {err}
        </div>
      )}

      <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 900 }}>Upload staging</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            Source System
            <select
              value={sourceSystem}
              onChange={(e) => {
                setSourceSystem(e.target.value);
              }}
            >
              <option value="Ontrac">Ontrac</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
  Region
  <select
    value={region}
    onChange={(e) => setRegion(e.target.value)}
  >
    <option value="">Select a region…</option>
    {KNOWN_REGIONS.map((r) => (
      <option key={r.name} value={r.name}>
        {r.name}{r.codes?.length ? ` (${r.codes.join("/")})` : ""}
      </option>
    ))}
  </select>

  <div style={{ fontSize: 12, opacity: 0.75 }}>
    Tip: auto-detect can select a region when the filename contains a region name or code.
  </div>
</label>


          <label style={{ display: "grid", gap: 6 }}>
            Fiscal Ref Date (optional)
            <input type="date" value={fiscalRefDate} onChange={(e) => setFiscalRefDate(e.target.value)} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Batch Label
            <input
              value={batchLabel}
              onChange={(e) => {
                labelTouchedRef.current = true;
                setBatchLabel(e.target.value);
              }}
              placeholder="Auto-generated"
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Auto-generated from Region + Source System until you edit it.
            </div>
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          Notes (optional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 900 }}>Raw file</div>

        <UploadDropzone onFileSelected={(f) => pickFile(f)} />

        <div style={{ fontSize: 13, opacity: 0.85 }}>
          {file ? (
            <>
              Selected: <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
            </>
          ) : (
            <>No file selected yet.</>
          )}
        </div>

        {stagingHint ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>{stagingHint}</div>
        ) : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={doUploadAll}
            disabled={!canUpload}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}
          >
            {busy ?? "Upload"}
          </button>

          <button
            onClick={doUndo}
            disabled={!batchId || !!busy}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}
          >
            {busy === "Undoing…" ? "Undoing…" : "Undo Last"}
          </button>

          {batchId && (
            <span style={{ fontSize: 13, opacity: 0.85 }}>
              Current/Last batch: <code style={{ fontWeight: 900 }}>{batchId}</code>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
