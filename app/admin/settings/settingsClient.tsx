// app/admin/settings/settingsClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type ReportSettingRow = {
  metric_name: string; // raw header name (key) — READ ONLY
  report_label: string;

  p4p_enabled: boolean;
  p4p_weight: number;

  other_enabled: boolean;
  other_weight: number;

  format?: "number" | "percent";
};

type SaveResp = { ok: true; updated?: number; scope?: string } | { ok: false; error: string };

type KnownMetricsResp =
  | {
      ok: true;
      source_system: string;
      count: number;
      metrics: Array<{ metric_name: string; format?: "number" | "percent" }>;
    }
  | { ok: false; error: string };

type GetSettingsResp =
  | { ok: true; rows: any[] }
  | { ok: true; data: any[] }
  | { ok: true; settings: any[] }
  | { ok: true; items: any[] }
  | { ok: false; error: string };

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  const contentType = (res.headers.get("content-type") || "").toLowerCase();

  const looksJson =
    contentType.includes("application/json") ||
    text.trim().startsWith("{") ||
    text.trim().startsWith("[");

  if (!looksJson) {
    const snippet = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`Non-JSON response from ${url}: HTTP ${res.status} ${res.statusText} • ${snippet}`);
  }

  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    const snippet = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`Invalid JSON from ${url}: HTTP ${res.status} ${res.statusText} • ${snippet}`);
  }

  if (!res.ok || (json && json.ok === false)) {
    throw new Error(json?.error || `HTTP ${res.status} ${res.statusText}`);
  }

  return json as T;
}

function toNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(x: any): ReportSettingRow | null {
  const metric_name = String(x?.metric_name ?? "").trim();
  if (!metric_name) return null;

  return {
    metric_name,
    report_label: String(x?.report_label ?? x?.label ?? x?.kpi_name ?? metric_name).trim(),

    p4p_enabled: !!x?.p4p_enabled,
    p4p_weight: toNum(x?.p4p_weight),

    other_enabled: !!x?.other_enabled,
    other_weight: toNum(x?.other_weight),

    format: x?.format === "percent" ? "percent" : x?.format === "number" ? "number" : undefined,
  };
}

function extractRowsFromGet(json: any): any[] {
  const arr =
    json?.rows ??
    json?.data ??
    json?.settings ??
    json?.items ??
    (Array.isArray(json) ? json : null);

  return Array.isArray(arr) ? arr : [];
}

export default function SettingsClient({
  scope,
  initialRows,
}: {
  scope: string;
  initialRows: ReportSettingRow[];
}) {
  const [rows, setRows] = useState<ReportSettingRow[]>(
    (initialRows ?? []).map((r) => normalizeRow(r)).filter(Boolean) as ReportSettingRow[]
  );

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // ✅ Allowlist pulled from server
  const [knownMetrics, setKnownMetrics] = useState<Array<{ metric_name: string; format?: "number" | "percent" }>>([]);
  const [knownErr, setKnownErr] = useState<string | null>(null);

  // Add controls (guarded)
  const [pickMetric, setPickMetric] = useState<string>("");

  // Fetch allowlist once
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setKnownErr(null);
      try {
        const json = await fetchJson<KnownMetricsResp>("/api/ingest/known-metrics?source_system=all", {
          method: "GET",
          cache: "no-store",
        });

        const arr = (json as any).metrics ?? [];
        const cleaned = Array.isArray(arr)
  ? arr
      .map(
        (m: any): { metric_name: string; format?: "number" | "percent" } => ({
          metric_name: String(m?.metric_name ?? "").trim(),
          format: m?.format === "percent" ? "percent" : m?.format === "number" ? "number" : undefined,
        })
      )
      .filter((m) => m.metric_name)
  : [];


        if (!cleaned.length) throw new Error("known-metrics returned zero metrics");

        if (!cancelled) setKnownMetrics(cleaned);
      } catch (e: any) {
        if (!cancelled) {
          setKnownErr(e?.message || "Failed to load known metrics");
          setKnownMetrics([]); // existing rows still work
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const knownList = useMemo(() => knownMetrics.map((m) => m.metric_name), [knownMetrics]);
  const knownMap = useMemo(() => new Map(knownMetrics.map((m) => [m.metric_name, m])), [knownMetrics]);
  const allowedSet = useMemo(() => new Set(knownList), [knownList]);
  const existingSet = useMemo(() => new Set(rows.map((r) => r.metric_name)), [rows]);

  const availableToAdd = useMemo(() => {
    if (!knownList.length) return [];
    return knownList.filter((m) => !existingSet.has(m));
  }, [knownList, existingSet]);

  const p4pSum = useMemo(() => rows.reduce((acc, r) => acc + (r.p4p_enabled ? toNum(r.p4p_weight) : 0), 0), [rows]);
  const otherSum = useMemo(
    () => rows.reduce((acc, r) => acc + (r.other_enabled ? toNum(r.other_weight) : 0), 0),
    [rows]
  );

  function upsertMetric(metric_name: string) {
    const key = metric_name.trim();
    if (!key) return;

    // ✅ Guardrail: only allow from server-provided allowlist
    if (!allowedSet.has(key)) {
      setMsg(`Blocked: "${key}" is not in the known raw header list.`);
      return;
    }

    const meta = knownMap.get(key);

    setRows((prev) => {
      if (prev.some((r) => r.metric_name === key)) return prev;
      return [
        ...prev,
        {
          metric_name: key,
          report_label: key,
          p4p_enabled: false,
          p4p_weight: 0,
          other_enabled: false,
          other_weight: 0,
          format: meta?.format,
        },
      ];
    });
  }

  function addPicked() {
    setMsg(null);
    if (!pickMetric) return;
    upsertMetric(pickMetric);
    setPickMetric("");
  }

  function updateRow(metric_name: string, patch: Partial<ReportSettingRow>) {
    setRows((prev) => prev.map((r) => (r.metric_name === metric_name ? { ...r, ...patch } : r)));
  }

  function removeRow(metric_name: string) {
    setRows((prev) => prev.filter((r) => r.metric_name !== metric_name));
  }

  // ✅ THIS is the “DB verified refresh” loop you asked for
  async function reloadFromDb() {
    const json = await fetchJson<GetSettingsResp>(`/api/ingest/settings?scope=${encodeURIComponent(scope)}`, {
      method: "GET",
      cache: "no-store",
    });

    const arr = extractRowsFromGet(json);
    const normalized = arr.map(normalizeRow).filter(Boolean) as ReportSettingRow[];
    setRows(normalized);
  }

  async function save() {
    setSaving(true);
    setMsg(null);

    try {
      const payload = rows.map((r) => ({
        metric_name: r.metric_name,
        report_label: String(r.report_label ?? "").trim() || r.metric_name,

        p4p_enabled: !!r.p4p_enabled,
        p4p_weight: r.p4p_enabled ? toNum(r.p4p_weight) : 0,

        other_enabled: !!r.other_enabled,
        other_weight: r.other_enabled ? toNum(r.other_weight) : 0,

        format: r.format,
      }));

      const json = await fetchJson<SaveResp>("/api/ingest/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, rows: payload }),
      });

      const updated = (json as any).updated;

      // ✅ Immediately reload from DB as the source of truth
      await reloadFromDb();

      setMsg(`Saved${typeof updated === "number" ? ` (${updated} rows)` : ""} • reloaded from DB.`);
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const sortedRows = useMemo(() => [...rows].sort((a, b) => a.metric_name.localeCompare(b.metric_name)), [rows]);

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 14, overflow: "hidden" }}>
      <div style={topBar}>
        <div style={{ fontWeight: 950 }}>Report Settings</div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            P4P sum: <span style={{ fontVariantNumeric: "tabular-nums" }}>{p4pSum.toFixed(2)}</span> (target: 1.00)
          </div>

          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Other sum: <span style={{ fontVariantNumeric: "tabular-nums" }}>{otherSum.toFixed(2)}</span> (target: 1.00)
          </div>

          <button onClick={save} disabled={saving} style={btn}>
            {saving ? "Saving..." : "Save"}
          </button>

          <button
            onClick={async () => {
              setMsg(null);
              try {
                await reloadFromDb();
                setMsg("Reloaded from DB.");
              } catch (e: any) {
                setMsg(e?.message || "Reload failed");
              }
            }}
            disabled={saving}
            style={btnSm}
          >
            Reload
          </button>
        </div>
      </div>

      {/* Guarded Add Controls (server allowlist) */}
      <div style={{ padding: 12, borderBottom: "1px solid #ddd", display: "grid", gap: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Add metrics is restricted to the server-known metrics catalog (prevents typos breaking joins).
        </div>

        {knownErr ? (
          <div style={{ fontSize: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(220,60,60,0.4)" }}>
            <b>Known metrics not loaded:</b> {knownErr}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={pickMetric}
            onChange={(e) => setPickMetric(e.target.value)}
            style={{ ...input, minWidth: 320 }}
            disabled={!knownList.length}
          >
            <option value="">{knownList.length ? "Select a raw header…" : "Loading known headers…"}</option>
            {availableToAdd.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <button onClick={addPicked} style={btnSm} disabled={!pickMetric || !knownList.length}>
            Add
          </button>

          <button
            onClick={() => {
              if (!knownList.length) return;
              setRows((prev) => {
                const next = [...prev];
                for (const meta of knownMetrics) {
                  const m = meta.metric_name;
                  if (!next.some((r) => r.metric_name === m)) {
                    next.push({
                      metric_name: m,
                      report_label: m,
                      p4p_enabled: false,
                      p4p_weight: 0,
                      other_enabled: false,
                      other_weight: 0,
                      format: meta.format,
                    });
                  }
                }
                return next;
              });
            }}
            style={btnSm}
            disabled={!knownList.length}
          >
            Add all known
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Raw Header Name</th>
              <th style={th}>Report Label</th>
              <th style={thCenter}>P4P</th>
              <th style={th}>P4P Weight</th>
              <th style={thCenter}>Other</th>
              <th style={th}>Other Weight</th>
              <th style={th} />
            </tr>
          </thead>

          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 14, fontSize: 13, opacity: 0.75 }}>
                  No metrics configured yet.
                </td>
              </tr>
            ) : (
              sortedRows.map((r) => (
                <tr key={r.metric_name}>
                  <td style={tdMono}>{r.metric_name}</td>

                  <td style={td}>
                    <input
                      value={r.report_label ?? ""}
                      onChange={(e) => updateRow(r.metric_name, { report_label: e.target.value })}
                      style={input}
                    />
                  </td>

                  <td style={tdCenter}>
                    <input
                      type="checkbox"
                      checked={!!r.p4p_enabled}
                      onChange={(e) =>
                        updateRow(r.metric_name, {
                          p4p_enabled: e.target.checked,
                          p4p_weight: e.target.checked ? r.p4p_weight : 0,
                        })
                      }
                    />
                  </td>

                  <td style={td}>
                    <input
                      type="number"
                      step="0.01"
                      value={toNum(r.p4p_weight)}
                      onChange={(e) => updateRow(r.metric_name, { p4p_weight: toNum(e.target.value) })}
                      style={inputRight}
                      disabled={!r.p4p_enabled}
                    />
                  </td>

                  <td style={tdCenter}>
                    <input
                      type="checkbox"
                      checked={!!r.other_enabled}
                      onChange={(e) =>
                        updateRow(r.metric_name, {
                          other_enabled: e.target.checked,
                          other_weight: e.target.checked ? r.other_weight : 0,
                        })
                      }
                    />
                  </td>

                  <td style={td}>
                    <input
                      type="number"
                      step="0.01"
                      value={toNum(r.other_weight)}
                      onChange={(e) => updateRow(r.metric_name, { other_weight: toNum(e.target.value) })}
                      style={inputRight}
                      disabled={!r.other_enabled}
                    />
                  </td>

                  <td style={td}>
                    <button onClick={() => removeRow(r.metric_name)} style={btnSmDanger}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {msg ? (
        <div style={{ padding: 12, borderTop: "1px solid #ddd", fontSize: 12, opacity: 0.9 }}>
          {msg}
        </div>
      ) : null}
    </div>
  );
}

const topBar: React.CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #ddd",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
  opacity: 0.9,
  whiteSpace: "nowrap",
};

const thCenter: React.CSSProperties = { ...th, textAlign: "center" };

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
  fontSize: 13,
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

const tdCenter: React.CSSProperties = { ...td, textAlign: "center" };

const tdMono: React.CSSProperties = {
  ...td,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  fontSize: 12,
  opacity: 0.9,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #ddd",
  background: "transparent",
  color: "inherit",
};

const inputRight: React.CSSProperties = {
  ...input,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "transparent",
  color: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};

const btnSm: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 12,
  border: "1px solid #ddd",
  background: "transparent",
  color: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};

const btnSmDanger: React.CSSProperties = {
  ...btnSm,
  border: "1px solid rgba(220,60,60,0.5)",
};
