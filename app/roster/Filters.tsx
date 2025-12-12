"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  divisions: string[];
  regions: string[];
  companies: string[];
  itgSupervisors: string[];
};

export default function Filters({
  divisions,
  regions,
  companies,
  itgSupervisors,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const division = sp.get("division") ?? "";
  const region = sp.get("region") ?? "";
  const company = sp.get("company") ?? "";
  const itgSupervisor = sp.get("itg_supervisor") ?? "";
  const status = sp.get("status") ?? ""; // "" | "active" | "inactive"

  function pushParams(params: URLSearchParams) {
    const q = params.toString();
    router.push(q ? `/roster?${q}` : "/roster");
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());

    if (!value) params.delete(key);
    else params.set(key, value);

    // Cascading clears (top → bottom)
    if (key === "division") {
      params.delete("region");
      params.delete("company");
      params.delete("itg_supervisor");
    }
    if (key === "region") {
      params.delete("company");
      params.delete("itg_supervisor");
    }
    if (key === "company") {
      params.delete("itg_supervisor");
    }

    pushParams(params);
  }

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 14, maxWidth: 760 }}>
      {/* Division buttons */}
      <div>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Division</div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setParam("division", "")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: division ? "transparent" : "black",
              color: division ? "inherit" : "white",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            All
          </button>

          {divisions.map((d) => {
            const active = d === division;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setParam("division", d)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: active ? "black" : "transparent",
                  color: active ? "white" : "inherit",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Region */}
      <div>
        <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>
          Region
        </label>
        <select
          value={region}
          onChange={(e) => setParam("region", e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "transparent",
            color: "inherit",
            fontWeight: 800,
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

      {/* Company */}
      <div>
        <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>
          Company
        </label>
        <select
          value={company}
          onChange={(e) => setParam("company", e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "transparent",
            color: "inherit",
            fontWeight: 800,
          }}
        >
          <option value="">Select a Company…</option>
          {companies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* ITG Supervisor */}
      <div>
        <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>
          ITG Supervisor
        </label>
        <select
          value={itgSupervisor}
          onChange={(e) => setParam("itg_supervisor", e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "transparent",
            color: "inherit",
            fontWeight: 800,
          }}
        >
          <option value="">Select an ITG Supervisor…</option>
          {itgSupervisors.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Status */}
      <div>
        <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>
          Status
        </label>
        <select
          value={status}
          onChange={(e) => setParam("status", e.target.value)}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "transparent",
            color: "inherit",
            fontWeight: 800,
          }}
        >
          <option value="">All (Active + Inactive)</option>
          <option value="active">Active (end_date is NULL)</option>
          <option value="inactive">Inactive (end_date is NOT NULL)</option>
        </select>
      </div>
    </div>
  );
}
