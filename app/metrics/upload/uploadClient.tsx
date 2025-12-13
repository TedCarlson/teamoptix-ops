"use client";

import { useEffect, useMemo, useState } from "react";

type UploadResp =
  | { ok: true; batch_id: string; storage_path: string; original_filename: string }
  | { ok: false; error: string };

type SimpleResp = { ok: boolean; error?: string; inserted?: number; batch_id?: string };

export default function MetricsUploadClient() {
  const [file, setFile] = useState<File | null>(null);

  const [sourceSystem, setSourceSystem] = useState("Ontrac");
  const [region, setRegion] = useState("Keystone");
  const [batchLabel, setBatchLabel] = useState("");
  const [fiscalRefDate, setFiscalRefDate] = useState<string>(""); // YYYY-MM-DD
  const [notes, setNotes] = useState("");

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [batchId, setBatchId] = useState<string | null>(null);
  const canUpload = useMemo(() => !!file && !busy, [file, busy]);

  // remember last batch locally (helps “undo last” after refresh)
  useEffect(() => {
    const saved = localStorage.getItem("last_kpi_batch_id");
    if (saved && !batchId) setBatchId(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (batchId) localStorage.setItem("last_kpi_batch_id", batchId);
  }, [batchId]);

  function pickFile(f: File | null) {
  setErr(null); // or setError(null) depending on your state name
  setFile(null);

  if (!f) return;

  const lower = f.name.toLowerCase();
  const ok = lower.endsWith(".csv") || lower.endsWith(".xlsx");

  if (!ok) {
    setErr("Please upload a .csv or .xlsx file.");
    return;
  }

  setFile(f);
}


  async function doUpload() {
    if (!file) return;
    setErr(null);
    setBusy("Uploading…");

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source_system", sourceSystem);
      fd.append("region", region);
      if (batchLabel.trim()) fd.append("batch_label", batchLabel.trim());
      if (notes.trim()) fd.append("notes", notes.trim());
      if (fiscalRefDate.trim()) fd.append("fiscal_ref_date", fiscalRefDate.trim());

      const res = await fetch("/api/metrics/upload", { method: "POST", body: fd });
      const json = (await res.json()) as UploadResp;

      if (!res.ok || !json.ok) throw new Error((json as any).error || "Upload failed");

      setBatchId(json.batch_id);
    } catch (e: any) {
      setErr(e?.message ?? "Upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function doParse() {
    if (!batchId) return;
    setErr(null);
    setBusy("Parsing…");
    try {
      const res = await fetch("/api/metrics/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const json = (await res.json()) as SimpleResp;
      if (!res.ok || !json.ok) throw new Error(json.error || "Parse failed");
    } catch (e: any) {
      setErr(e?.message ?? "Parse failed");
    } finally {
      setBusy(null);
    }
  }

  async function doCommit() {
    if (!batchId) return;
    setErr(null);
    setBusy("Committing…");
    try {
      const res = await fetch("/api/metrics/commit-ontrac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const json = (await res.json()) as SimpleResp;
      if (!res.ok || !json.ok) throw new Error(json.error || "Commit failed");
    } catch (e: any) {
      setErr(e?.message ?? "Commit failed");
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
        <div style={{ fontWeight: 900 }}>Upload settings</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            Source System
            <select value={sourceSystem} onChange={(e) => setSourceSystem(e.target.value)}>
              <option value="Ontrac">Ontrac</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Region
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Keystone" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Fiscal Ref Date (optional)
            <input type="date" value={fiscalRefDate} onChange={(e) => setFiscalRefDate(e.target.value)} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            Batch Label (optional)
            <input value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} placeholder="Keystone Ontrac" />
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          Notes (optional)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 16, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 900 }}>Raw file</div>

        <input
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />

        <div style={{ fontSize: 13, opacity: 0.85 }}>
          {file ? (
            <>
              Selected: <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
            </>
          ) : (
            <>No file selected yet.</>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={doUpload}
            disabled={!canUpload}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}
          >
            {busy === "Uploading…" ? "Uploading…" : "Upload"}
          </button>

          <button
            onClick={doParse}
            disabled={!batchId || !!busy}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}
          >
            {busy === "Parsing…" ? "Parsing…" : "Parse"}
          </button>

          <button
            onClick={doCommit}
            disabled={!batchId || !!busy}
            style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #ddd", fontWeight: 900 }}
          >
            {busy === "Committing…" ? "Committing…" : "Commit to Master"}
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
