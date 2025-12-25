// app/admin/settings/page.tsx
import { headers } from "next/headers";
import SettingsClient from "./settingsClient";

type ReportSettingRow = {
  metric_name: string; // raw header name (key)
  report_label: string;

  p4p_enabled: boolean;
  p4p_weight: number;

  other_enabled: boolean;
  other_weight: number;
};

type SettingsResp =
  | { ok: true; scope: string; rows: ReportSettingRow[]; updated_at?: string | null }
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

// Next.js 16+: headers() is async.
async function getBaseUrl() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`;
}

function normalizeRow(x: any): ReportSettingRow | null {
  const metric_name = String(x?.metric_name ?? "").trim();
  if (!metric_name) return null;

  return {
  metric_name,
  report_label: String(x?.report_label ?? x?.label ?? x?.kpi_name ?? metric_name).trim(),

  // tolerate legacy fields: enabled/weight -> p4p_enabled/p4p_weight
  p4p_enabled: Boolean(x?.p4p_enabled ?? x?.enabled ?? false),
  p4p_weight: Number(x?.p4p_weight ?? x?.weight ?? 0) || 0,

  other_enabled: Boolean(x?.other_enabled ?? false),
  other_weight: Number(x?.other_weight ?? 0) || 0,
};

}

async function loadReportSettings(scope: string): Promise<{ scope: string; rows: ReportSettingRow[] }> {
  const base = await getBaseUrl();
  const url = `${base}/api/ingest/settings?scope=${encodeURIComponent(scope)}`;

  const json = await fetchJson<SettingsResp>(url, { cache: "no-store" });

  const rowsRaw = (json as any)?.rows ?? [];
  const rows: ReportSettingRow[] = Array.isArray(rowsRaw)
  ? rowsRaw
      .map(normalizeRow)
      .filter((r): r is ReportSettingRow => r !== null)
  : [];

  return { scope: (json as any).scope ?? scope, rows };
}

export default async function AdminSettingsPage() {
  const scope = "global";
  const { rows } = await loadReportSettings(scope);

  return (
    <main style={{ padding: 40, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Admin: Settings</h1>
      <p style={{ marginTop: 10, opacity: 0.75 }}>
        Configure report ingredients: select metrics and weights for <b>P4P</b> and <b>Other/Internal</b>.
      </p>

      <SettingsClient scope={scope} initialRows={rows} />
    </main>
  );
}
