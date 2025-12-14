"use client";

import { useMemo, useState } from "react";

type Row = {
  scope: string;
  metric_name: string;
  label: string | null;
  kpi_name: string | null;
  enabled: boolean;
  weight: number;
  sort_order: number;
  format: "number" | "percent";
  hidden: boolean;
};

export default function SettingsClient({ scope, initialRows }: { scope: string; initialRows: Row[] }) {
  const [showHidden, setShowHidden] = useState(false);

  const [rows, setRows] = useState<Row[]>(
    (initialRows ?? []).map((r) => ({
      scope: r.scope ?? scope,
      metric_name: r.metric_name,
      label: r.label ?? r.metric_name,
      kpi_name: r.kpi_name ?? r.label ?? r.metric_name,
      enabled: !!r.enabled,
      hidden: !!r.hidden,
      weight: Number(r.weight ?? 0),
      sort_order: Number(r.sort_order ?? 100),
      format: (r.format === "percent" ? "percent" : "number") as any,
    }))
  );

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    const base = showHidden ? rows : rows.filter((r) => !r.hidden);
    return [...base].sort((a, b) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || String(a.kpi_name).localeCompare(String(b.kpi_name)));
  }, [rows, showHidden]);

  const enabledWeightSum = useMemo(() => {
    return rows.reduce((acc, r) => acc + (r.enabled && !r.hidden ? (Number(r.weight) || 0) : 0), 0);
  }, [rows]);

  function updateRow(metric_name: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.metric_name === metric_name ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setMsg(null);

    try {
      // Enforce: hidden rows cannot be enabled
      const payloadRows = rows.map((r) => ({
        metric_name: r.metric_name,
        label: r.label,
        kpi_name: r.kpi_name,
        enabled: r.hidden ? false : !!r.enabled,
        hidden: !!r.hidden,
        weight: r.hidden ? 0 : Number(r.weight) || 0,
        sort_order: Number(r.sort_order) || 100,
        format: r.format,
      }));

      const res = await fetch("/api/metrics/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope, rows: payloadRows }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Save failed");

      setMsg(`Saved (${json.updated} rows).`);
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: 12, borderBottom: "1px solid #ddd", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 950 }}>KPI Settings</div>

        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, opacity: 0.9 }}>
            <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            Show hidden metrics
          </label>

          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Enabled weight sum: <span style={{ fontVariantNumeric: "tabular-nums" }}>{enabledWeightSum.toFixed(2)}</span> (target: 1.00)
          </div>

          <button onClick={save} disabled={saving} style={btn}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>On</th>
              <th style={th}>KPI Name (report)</th>
              <th style={th}>Weight</th>
              <th style={th}>Format</th>
              <th style={th}>Order</th>
              <th style={th}>Metric Name (raw)</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.metric_name} style={r.hidden ? { opacity: 0.6 } : undefined}>
                <td style={td}>
                  <input
                    type="checkbox"
                    checked={r.hidden ? false : r.enabled}
                    disabled={r.hidden}
                    onChange={(e) => updateRow(r.metric_name, { enabled: e.target.checked })}
                  />
                </td>

                <td style={td}>
                  <input
                    value={r.kpi_name ?? ""}
                    onChange={(e) => updateRow(r.metric_name, { kpi_name: e.target.value })}
                    style={input}
                    disabled={r.hidden}
                  />
                </td>

                <td style={td}>
                  <input
                    type="number"
                    step="0.01"
                    value={Number(r.weight)}
                    onChange={(e) => updateRow(r.metric_name, { weight: Number(e.target.value) })}
                    style={inputRight}
                    disabled={r.hidden}
                  />
                </td>

                <td style={td}>
                  <select
                    value={r.format}
                    onChange={(e) => updateRow(r.metric_name, { format: e.target.value as any })}
                    style={input}
                    disabled={r.hidden}
                  >
                    <option value="number">number</option>
                    <option value="percent">percent</option>
                  </select>
                </td>

                <td style={td}>
                  <input
                    type="number"
                    step="1"
                    value={Number(r.sort_order)}
                    onChange={(e) => updateRow(r.metric_name, { sort_order: Number(e.target.value) })}
                    style={inputRight}
                    disabled={r.hidden}
                  />
                </td>

                <td style={tdMono}>
                  {r.metric_name}
                  {r.hidden ? <span style={{ marginLeft: 8, fontSize: 11 }}>(hidden)</span> : null}
                </td>
              </tr>
            ))}
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

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #ddd",
  fontSize: 12,
  opacity: 0.9,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "10px 10px",
  borderBottom: "1px solid #eee",
  fontSize: 13,
  whiteSpace: "nowrap",
};

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
