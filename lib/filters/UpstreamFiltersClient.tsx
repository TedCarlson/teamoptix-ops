"use client";

import React, { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type FilterOpt = { value: string; label: string };

export type UpstreamFiltersProps = {
  divisions?: FilterOpt[]; // division_id -> division name
  regions?: FilterOpt[]; // region_id -> region name (already filtered by division on the server)
  companies?: FilterOpt[]; // company_code -> company name (already filtered by division+region on the server)
};

function s(v: string | null) {
  return (v ?? "").trim();
}

export default function UpstreamFiltersClient(props: UpstreamFiltersProps) {
  const divisions = Array.isArray(props.divisions) ? props.divisions : [];
  const regions = Array.isArray(props.regions) ? props.regions : [];
  const companies = Array.isArray(props.companies) ? props.companies : [];

  const router = useRouter();
  const sp = useSearchParams();

  const month = s(sp.get("month"));

  // SMART params
  const divisionId = s(sp.get("division_id"));
  const regionId = s(sp.get("region_id"));
  const companyCode = s(sp.get("company_code"));

  // validate against provided option lists (which are already cascaded server-side)
  const divisionOk = !divisionId || divisions.some((d) => d.value === divisionId);
  const regionOk = !regionId || regions.some((r) => r.value === regionId);
  const companyOk = !companyCode || companies.some((c) => c.value === companyCode);

  const effectiveDivisionId = divisionOk ? divisionId : "";
  const effectiveRegionId = regionOk ? regionId : "";
  const effectiveCompanyCode = companyOk ? companyCode : "";

  // convenience labels for placeholder text
  const divisionLabel = useMemo(() => {
    if (!effectiveDivisionId) return "";
    return divisions.find((d) => d.value === effectiveDivisionId)?.label ?? "";
  }, [divisions, effectiveDivisionId]);

  const regionLabel = useMemo(() => {
    if (!effectiveRegionId) return "";
    return regions.find((r) => r.value === effectiveRegionId)?.label ?? "";
  }, [regions, effectiveRegionId]);

  function pushParams(params: URLSearchParams, replace = false) {
    // keep month stable if present
    if (month && !params.get("month")) params.set("month", month);

    const q = params.toString();
    const href = q ? `/smart?${q}` : "/smart";
    if (replace) router.replace(href);
    else router.push(href);
  }

  function setParam(key: "division_id" | "region_id" | "company_code", value: string) {
    const params = new URLSearchParams(sp.toString());

    if (!value) params.delete(key);
    else params.set(key, value);

    // cascade clears
    if (key === "division_id") {
      params.delete("region_id");
      params.delete("company_code");
    }
    if (key === "region_id") {
      params.delete("company_code");
    }

    pushParams(params);
  }

  // canonicalize invalid/stale params
  useEffect(() => {
    const needsFix =
      divisionId !== effectiveDivisionId ||
      regionId !== effectiveRegionId ||
      companyCode !== effectiveCompanyCode;

    if (!needsFix) return;

    const params = new URLSearchParams(sp.toString());

    if (divisionId !== effectiveDivisionId) {
      if (effectiveDivisionId) params.set("division_id", effectiveDivisionId);
      else params.delete("division_id");
      params.delete("region_id");
      params.delete("company_code");
    }

    if (regionId !== effectiveRegionId) {
      if (effectiveRegionId) params.set("region_id", effectiveRegionId);
      else params.delete("region_id");
      params.delete("company_code");
    }

    if (companyCode !== effectiveCompanyCode) {
      if (effectiveCompanyCode) params.set("company_code", effectiveCompanyCode);
      else params.delete("company_code");
    }

    pushParams(params, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId, regionId, companyCode, effectiveDivisionId, effectiveRegionId, effectiveCompanyCode, month]);

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #ddd",
    background: "transparent",
    color: "inherit",
    fontWeight: 800,
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontWeight: 900,
    marginBottom: 6,
  };

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 14, maxWidth: 760 }}>
      {/* Division (dropdown) */}
      <div>
        <label style={labelStyle}>Division</label>
        <select
          value={effectiveDivisionId}
          onChange={(e) => setParam("division_id", e.target.value)}
          style={selectStyle}
        >
          <option value="">{divisions.length ? "All Divisions" : "No divisions"}</option>
          {divisions.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        {divisionLabel ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>{divisionLabel}</div> : null}
      </div>

      {/* Region (dropdown) — depends on division */}
      <div>
        <label style={labelStyle}>Region</label>
        <select
          value={effectiveRegionId}
          onChange={(e) => setParam("region_id", e.target.value)}
          style={selectStyle}
          disabled={!regions.length}
          title={!regions.length ? "Select a division to load regions" : undefined}
        >
          <option value="">
            {regions.length
              ? "All Regions"
              : effectiveDivisionId
              ? "No regions for selected division"
              : "Select a division first"}
          </option>
          {regions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {regionLabel ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>{regionLabel}</div> : null}
      </div>

      {/* Company (dropdown) — depends on division + region */}
      <div>
        <label style={labelStyle}>Company</label>
        <select
          value={effectiveCompanyCode}
          onChange={(e) => setParam("company_code", e.target.value)}
          style={selectStyle}
          disabled={!companies.length}
          title={!companies.length ? "Select division/region to load companies" : undefined}
        >
          <option value="">
            {companies.length
              ? "All Companies"
              : effectiveRegionId
              ? "No companies for selected region"
              : effectiveDivisionId
              ? "Select a region to load companies"
              : "Select division + region first"}
          </option>

          {companies.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
