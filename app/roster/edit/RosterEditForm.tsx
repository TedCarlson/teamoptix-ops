"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";

type OrgDivision = { division_id: string; division_name: string };
type OrgRegion = { region_id: string; region_name: string; division_id: string };
type OrgPC = { pc_id: string; pc_name: string; region_id: string };
type OrgOffice = { office_id: string; office_name: string; pc_id: string };
type OrgCompany = { company_id: string; company_name: string; c_code: string | null; is_primary: boolean };

type RosterRow = {
  roster_id?: string;

  division?: string | null;
  region?: string | null;
  pc?: string | null;
  office?: string | null;

  status?: string | null;
  tech_id?: string | null;
  full_name?: string | null;

  company?: string | null;
  c_code?: string | null;

  supervisor?: string | null;
  role?: string | null;

  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  notes?: string | null;
};

const cardStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 18,
  padding: 18,
  background: "rgba(255,255,255,0.02)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  outline: "none",
};

const textAreaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 110,
  resize: "vertical",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
  alignItems: "start",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontWeight: 800,
  opacity: 0.9,
  letterSpacing: 0.2,
};

const helperStyle: CSSProperties = {
  fontSize: 12,
  opacity: 0.7,
  lineHeight: 1.2,
};

const buttonStyle: CSSProperties = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.22)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 900,
  cursor: "pointer",
};

async function fetchOrg(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  if (params.division_id) qs.set("division_id", params.division_id);
  if (params.region_id) qs.set("region_id", params.region_id);
  if (params.pc_id) qs.set("pc_id", params.pc_id);

  const res = await fetch(`/api/org/options?${qs.toString()}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load org options");
  return json as {
    ok: true;
    divisions: OrgDivision[];
    regions: OrgRegion[];
    pcs: OrgPC[];
    offices: OrgOffice[];
    companies: OrgCompany[];
  };
}

export default function RosterEditForm({ initial }: { initial: RosterRow }) {
  const router = useRouter();

  const [form, setForm] = useState<RosterRow>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lookup catalogs
  const [divisions, setDivisions] = useState<OrgDivision[]>([]);
  const [regions, setRegions] = useState<OrgRegion[]>([]);
  const [pcs, setPcs] = useState<OrgPC[]>([]);
  const [offices, setOffices] = useState<OrgOffice[]>([]);
  const [companies, setCompanies] = useState<OrgCompany[]>([]);
  const [loadingOrg, setLoadingOrg] = useState(false);

  // Selected IDs for cascade dropdowns
  const [divisionId, setDivisionId] = useState<string>("");
  const [regionId, setRegionId] = useState<string>("");
  const [pcId, setPcId] = useState<string>("");

  // If the parent ever changes initial (rare, but safe), sync it
  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const isEdit = useMemo(() => !!form.roster_id, [form.roster_id]);

  function set<K extends keyof RosterRow>(key: K, value: RosterRow[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // 1) Load top-level org catalogs (divisions + companies) once
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoadingOrg(true);
        const json = await fetchOrg({});
        if (cancelled) return;

        setDivisions(json.divisions ?? []);
        setCompanies(json.companies ?? []);

        // Attempt to auto-select based on existing text values in roster_v2
        // (We store text in roster_v2, not ids, so we match by name.)
        if (form.division) {
          const d = (json.divisions ?? []).find(
            (x) => x.division_name.toLowerCase() === (form.division ?? "").trim().toLowerCase()
          );
          if (d) setDivisionId(d.division_id);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load org catalogs");
      } finally {
        if (!cancelled) setLoadingOrg(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // initial load only

  // 2) When divisionId changes -> fetch regions; also attempt to match existing region text
  useEffect(() => {
    if (!divisionId) {
      setRegions([]);
      setRegionId("");
      setPcs([]);
      setPcId("");
      setOffices([]);
      // keep form fields as-is, but UI cascade resets
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingOrg(true);
        const json = await fetchOrg({ division_id: divisionId });
        if (cancelled) return;

        setRegions(json.regions ?? []);

        // Match current form.region to id (if present)
        if (form.region) {
          const r = (json.regions ?? []).find(
            (x) => x.region_name.toLowerCase() === (form.region ?? "").trim().toLowerCase()
          );
          setRegionId(r?.region_id ?? "");
        } else {
          setRegionId("");
        }

        // Reset downstream
        setPcs([]);
        setPcId("");
        setOffices([]);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load regions");
      } finally {
        if (!cancelled) setLoadingOrg(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionId]);

  // 3) When regionId changes -> fetch PCs; match existing pc text
  useEffect(() => {
    if (!regionId) {
      setPcs([]);
      setPcId("");
      setOffices([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingOrg(true);
        const json = await fetchOrg({ region_id: regionId });
        if (cancelled) return;

        setPcs(json.pcs ?? []);

        if (form.pc) {
          const p = (json.pcs ?? []).find(
            (x) => x.pc_name.toLowerCase() === (form.pc ?? "").trim().toLowerCase()
          );
          setPcId(p?.pc_id ?? "");
        } else {
          setPcId("");
        }

        setOffices([]);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load PCs");
      } finally {
        if (!cancelled) setLoadingOrg(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId]);

  // 4) When pcId changes -> fetch offices
  useEffect(() => {
    if (!pcId) {
      setOffices([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingOrg(true);
        const json = await fetchOrg({ pc_id: pcId });
        if (cancelled) return;

        setOffices(json.offices ?? []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Failed to load offices");
      } finally {
        if (!cancelled) setLoadingOrg(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pcId]);

  // Submit stays basically the same
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);

    const payload: any = { ...form };
    for (const k of Object.keys(payload)) {
      if (payload[k] === "") payload[k] = null;
    }

    try {
      const res = await fetch("/api/roster-v2", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Save failed");
      }

      router.push("/roster");
      router.refresh();
    } catch (e: any) {
      setErr(e.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  const selectedCompany = useMemo(() => {
    const name = (form.company ?? "").trim().toLowerCase();
    return companies.find((c) => c.company_name.trim().toLowerCase() === name);
  }, [companies, form.company]);

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 14 }}>
      {err && (
        <div
          style={{
            padding: 12,
            border: "1px solid rgba(255,120,120,0.7)",
            borderRadius: 14,
            background: "rgba(255,120,120,0.06)",
          }}
        >
          <strong>Error:</strong> {err}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ marginBottom: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ fontWeight: 900, opacity: 0.95 }}>
            {isEdit ? "Edit Roster Window" : "Create Roster Window"}
          </div>
          {loadingOrg && <div style={{ fontSize: 12, opacity: 0.7 }}>Loading options…</div>}
        </div>

        {/* ORG + COMPANY ASSISTS */}
        <div style={gridStyle}>
          <div style={fieldStyle}>
            <span style={labelStyle}>Division</span>
            <select
              style={inputStyle}
              value={divisionId}
              onChange={(e) => {
                const nextId = e.target.value;
                setDivisionId(nextId);

                const d = divisions.find((x) => x.division_id === nextId);
                set("division", d ? d.division_name : null);

                // Clear downstream text fields when changing parent selection
                set("region", null);
                set("pc", null);
                set("office", null);
              }}
            >
              <option value="">Select…</option>
              {divisions.map((d) => (
                <option key={d.division_id} value={d.division_id}>
                  {d.division_name}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <span style={labelStyle}>Region</span>
            <select
              style={inputStyle}
              value={regionId}
              onChange={(e) => {
                const nextId = e.target.value;
                setRegionId(nextId);

                const r = regions.find((x) => x.region_id === nextId);
                set("region", r ? r.region_name : null);

                set("pc", null);
                set("office", null);
              }}
              disabled={!divisionId}
            >
              <option value="">{divisionId ? "Select…" : "Select Division first"}</option>
              {regions.map((r) => (
                <option key={r.region_id} value={r.region_id}>
                  {r.region_name}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <span style={labelStyle}>PC</span>
            <select
              style={inputStyle}
              value={pcId}
              onChange={(e) => {
                const nextId = e.target.value;
                setPcId(nextId);

                const p = pcs.find((x) => x.pc_id === nextId);
                set("pc", p ? p.pc_name : null);

                set("office", null);
              }}
              disabled={!regionId}
            >
              <option value="">{regionId ? "Select…" : "Select Region first"}</option>
              {pcs.map((p) => (
                <option key={p.pc_id} value={p.pc_id}>
                  {p.pc_name}
                </option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <span style={labelStyle}>Office</span>
            <select
              style={inputStyle}
              value={(form.office ?? "") || ""}
              onChange={(e) => set("office", e.target.value || null)}
              disabled={!pcId}
            >
              <option value="">{pcId ? "Select…" : "Select PC first"}</option>
              {offices.map((o) => (
                <option key={o.office_id} value={o.office_name}>
                  {o.office_name}
                </option>
              ))}
            </select>
            <span style={helperStyle}>Optional. Only appears if office values exist for this PC.</span>
          </div>

          <div style={fieldStyle}>
            <span style={labelStyle}>Company</span>
            <select
              style={inputStyle}
              value={(form.company ?? "") || ""}
              onChange={(e) => {
                const nextName = e.target.value || null;
                set("company", nextName);

                // Assist: auto-fill c_code when company is selected
                const c = companies.find((x) => x.company_name === nextName);
                if (c?.c_code) set("c_code", c.c_code);
              }}
            >
              <option value="">Select…</option>
              {companies.map((c) => (
                <option key={c.company_id} value={c.company_name}>
                  {c.company_name}
                </option>
              ))}
            </select>
            {selectedCompany?.is_primary && <span style={helperStyle}>Primary company (ITG)</span>}
          </div>

          <div style={fieldStyle}>
            <span style={labelStyle}>C Code</span>
            <input
              style={inputStyle}
              value={form.c_code ?? ""}
              onChange={(e) => set("c_code", e.target.value)}
              placeholder="Auto-filled from Company (editable)"
            />
            <span style={helperStyle}>Auto-filled from Company; you can override if needed.</span>
          </div>
        </div>

        {/* PERSON + WINDOW */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 900, opacity: 0.9, marginBottom: 10 }}>Roster Window</div>

          <div style={gridStyle}>
            <div style={fieldStyle}>
              <span style={labelStyle}>Full Name</span>
              <input
                style={inputStyle}
                value={form.full_name ?? ""}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="e.g. Dmytro Kucher"
                autoComplete="name"
              />
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>Tech ID</span>
              <input
                style={inputStyle}
                value={form.tech_id ?? ""}
                onChange={(e) => set("tech_id", e.target.value)}
                placeholder="e.g. 7312"
              />
              <span style={helperStyle}>Leave blank if not a technician.</span>
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>Supervisor</span>
              <input
                style={inputStyle}
                value={form.supervisor ?? ""}
                onChange={(e) => set("supervisor", e.target.value)}
                placeholder="Supervisor name"
              />
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>Role</span>
              <input
                style={inputStyle}
                value={form.role ?? ""}
                onChange={(e) => set("role", e.target.value)}
                placeholder="e.g. Technician"
              />
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>Status</span>
              <input
                style={inputStyle}
                value={form.status ?? ""}
                onChange={(e) => set("status", e.target.value)}
                placeholder="e.g. Active / Inactive"
              />
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>Start Date</span>
              <input
                style={inputStyle}
                type="date"
                value={form.start_date ?? ""}
                onChange={(e) => set("start_date", e.target.value)}
              />
            </div>

            <div style={fieldStyle}>
              <span style={labelStyle}>End Date</span>
              <input
                style={inputStyle}
                type="date"
                value={form.end_date ?? ""}
                onChange={(e) => set("end_date", e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
            <div style={labelStyle}>Notes</div>
            <textarea
              style={textAreaStyle}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional notes…"
              rows={4}
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              ...buttonStyle,
              width: "100%",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving..." : isEdit ? "Update Roster Window" : "Create Roster Window"}
          </button>
        </div>
      </div>
    </form>
  );
}
