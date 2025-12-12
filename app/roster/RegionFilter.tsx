"use client";

import { useRouter, useSearchParams } from "next/navigation";

export default function RegionFilter({ regions }: { regions: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("region") ?? "";

  function setRegion(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next) params.delete("region");
    else params.set("region", next);
    router.push(`/roster?${params.toString()}`);
  }

  return (
    <div style={{ marginTop: 12 }}>
      <label style={{ display: "block", fontWeight: 800, marginBottom: 6 }}>
        Region
      </label>

      <select
        value={current}
        onChange={(e) => setRegion(e.target.value)}
        style={{
          width: 360,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid #ddd",
          background: "transparent",
          color: "inherit",
          fontWeight: 700,
        }}
      >
        <option value="">Select a Region…</option>
        {regions.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </div>
  );
}
