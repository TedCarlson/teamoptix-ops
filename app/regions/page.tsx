/**
 * FILE: app/regions/page.tsx
 *
 * PURPOSE:
 * Region directory / picker.
 * Shows regions under user purview (RLS later).
 *
 * NOW:
 * - Pulls canonical regions from DB truth via GET /api/ref/regions (regions_v2).
 * - Renders links to /region/[region_name] (scope container, not filter).
 * - Adds UI-only placeholders until DB has all 11 regions.
 *
 * CONSTRAINTS:
 * - No KPI rollups (reporting deferred)
 * - No fake DB rows
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import ComingSoon from "../_components/ComingSoon";

type RegionsApiResponse = { ok: true; regions: string[] } | { ok: false; error: string };

async function getOriginFromHeaders(): Promise<string> {
  const h = await headers();

  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host");

  // Defensive fallback (should not happen in normal Next/Vercel execution)
  if (!host) return "http://localhost:3000";

  return `${proto}://${host}`;
}

export default async function Page() {
  let regions: string[] = [];

  try {
    const origin = await getOriginFromHeaders();
    const url = new URL("/api/ref/regions", origin);

    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = (await res.json()) as RegionsApiResponse;

    if (json && "ok" in json && json.ok && Array.isArray(json.regions)) {
      regions = json.regions;
    }
  } catch {
    regions = [];
  }

  const targetTotal = 11;
  const placeholdersNeeded = Math.max(0, targetTotal - regions.length);
  const placeholders = Array.from(
    { length: placeholdersNeeded },
    (_, i) => `Region (pending DB) #${i + 1}`
  );

  return (
    <div className="space-y-6">
      <ComingSoon
        title="Regions"
        bullets={[
          "Region directory/picker (RLS-governed when enabled).",
          "Each region is a scope container (not a filtered view).",
          "Routes use region_name: /region/[region_name].",
          "Source of truth: GET /api/ref/regions (regions_v2).",
        ]}
      />

      <div className="max-w-3xl space-y-3">
        <h2 className="text-lg font-semibold">Available regions</h2>

        <ul className="space-y-2">
          {regions.map((region_name) => (
            <li key={region_name}>
              <Link className="underline" href={`/region/${encodeURIComponent(region_name)}`}>
                {region_name}
              </Link>
            </li>
          ))}

          {placeholders.map((label) => (
            <li key={label} className="opacity-50">
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
