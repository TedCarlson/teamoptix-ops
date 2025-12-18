import React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import SettingsClient from "./settingsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "";
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/+$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (!host) return "http://localhost:3000";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

async function loadSettings() {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/metrics/settings?scope=global`, { cache: "no-store" });
  return res.json() as Promise<{ ok: boolean; rows?: any[]; error?: string }>;
}

export default async function AdminSettingsPage() {
  const json = await loadSettings();

  return (
    <main style={{ padding: 40, maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Admin Settings</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>Enable KPIs and set weights (scope: global).</p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/admin" style={btnStyle}>
            Back to Admin
          </Link>
          <Link href="/smart" style={btnStyle}>
            Back to SMART
          </Link>
        </div>
      </div>

      {!json.ok ? (
        <div style={{ padding: 16, border: "1px solid #f2c2c2", borderRadius: 14 }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Could not load settings</div>
          <div style={{ opacity: 0.9 }}>{json.error ?? "Unknown error"}</div>
        </div>
      ) : (
        <SettingsClient scope="global" initialRows={json.rows ?? []} />
      )}
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #ddd",
  textDecoration: "none",
  fontWeight: 900,
};
