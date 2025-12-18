// app/smart/settings/page.tsx
import React from "react";
import { createClient } from "@supabase/supabase-js";
import SettingsClientSmart from "./settingsClientSmart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL fallback)");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, { auth: { persistSession: false } });
}

function firstParam(v: string | string[] | undefined): string {
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}

export default async function SmartSettingsPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const sp = await Promise.resolve(searchParams);
  const scope = firstParam(sp?.scope).trim() || "global";

  const sb = getSupabase();

  const { data: rows, error } = await sb
    .from("kpi_metric_settings_v1")
    .select("scope,metric_name,label,kpi_name,enabled,weight,sort_order,format,hidden")
    .eq("scope", scope)
    .order("sort_order", { ascending: true });

  if (error) {
    return (
      <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>SMART Settings</h1>
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #f2c2c2", borderRadius: 14 }}>
          <div style={{ fontWeight: 900 }}>Could not load settings</div>
          <div style={{ opacity: 0.85, marginTop: 6 }}>{error.message}</div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>SMART Settings</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Scope: <b>{scope}</b>
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <a
            href="/smart"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "transparent",
              color: "inherit",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            ← Back to SMART
          </a>
          <a
            href="/admin"
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "transparent",
              color: "inherit",
              fontWeight: 900,
              textDecoration: "none",
            }}
          >
            Admin →
          </a>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <SettingsClientSmart scope={scope} initialRows={(rows ?? []) as any[]} />
      </div>
    </main>
  );
}
