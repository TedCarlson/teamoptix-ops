// app/rubric/page.tsx
import React from 'react'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

type Band = 'exceed' | 'meet' | 'needs_improvement' | 'unacceptable' | 'no_data'
type ColorToken =
  | 'accent_positive'
  | 'accent_neutral'
  | 'accent_warning'
  | 'accent_critical'
  | 'accent_muted'

type ThresholdRow = {
  metric_name: string
  band: Band
  min_value: number | null
  max_value: number | null
  inclusive_min: boolean
  inclusive_max: boolean
  color_token: ColorToken
  report_label_snapshot: string
  format_snapshot: string
}

type MetricRubric = {
  metric_name: string
  report_label: string
  format: string
  bands: Record<Band, ThresholdRow>
}

type VersionRow = {
  id: number
  scope: string
  source_system: string
  fiscal_month_anchor: string
  committed_at: string
  active: boolean
}

const BAND_ORDER: Band[] = ['exceed', 'meet', 'needs_improvement', 'unacceptable', 'no_data']

const BAND_LABEL: Record<Band, string> = {
  exceed: 'Exceed Goal',
  meet: 'Meeting Goal',
  needs_improvement: 'Needs Improvement',
  unacceptable: 'Unacceptable',
  no_data: 'No Data',
}

function swatchClass(token: ColorToken) {
  switch (token) {
    case 'accent_positive':
      return 'bg-emerald-500'
    case 'accent_neutral':
      return 'bg-sky-500'
    case 'accent_warning':
      return 'bg-amber-500'
    case 'accent_critical':
      return 'bg-rose-500'
    case 'accent_muted':
      return 'bg-slate-400'
  }
}

function sbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, service, { auth: { persistSession: false } })
}

function calendarMonthAnchor(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  const mm = String(m).padStart(2, '0')
  return `${y}-${mm}-01`
}

function fmt(v: number | null) {
  return v === null || v === undefined ? '—' : String(v)
}

function toISO(d: string | null | undefined) {
  if (!d) return ''
  return String(d).slice(0, 10)
}

export default async function RubricReadOnlyPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const sb = sbAdmin()
  const sp = (await props.searchParams) ?? {}

  const todayISO = new Date().toISOString().slice(0, 10)
  const defaultAnchor = calendarMonthAnchor(todayISO)

  const scope = 'global'
  const source_system = 'ontrac'

  // 1) Load available anchors (based on commits)
  const { data: anchorsRaw, error: aErr } = await sb
    .from('ingest_rubric_versions_v1')
    .select('fiscal_month_anchor')
    .eq('scope', scope)
    .eq('source_system', source_system)
    .order('fiscal_month_anchor', { ascending: false })

  if (aErr) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold">Rubric</h1>
        <p className="mt-2 text-sm text-red-600">Failed to load rubric anchors: {String(aErr.message)}</p>
      </div>
    )
  }

  const anchors = Array.from(
    new Set((anchorsRaw ?? []).map((r: any) => toISO(r.fiscal_month_anchor)).filter(Boolean))
  )

  const anchorParam = sp.anchor
  const selectedAnchor = typeof anchorParam === 'string' && anchorParam ? anchorParam : defaultAnchor

  // 2) Load versions for the selected anchor (newest first)
  const { data: versions, error: vErr } = await sb
    .from('ingest_rubric_versions_v1')
    .select('id, scope, source_system, fiscal_month_anchor, committed_at, active')
    .eq('scope', scope)
    .eq('source_system', source_system)
    .eq('fiscal_month_anchor', selectedAnchor)
    .order('id', { ascending: false })

  if (vErr) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold">Rubric</h1>
        <p className="mt-2 text-sm text-red-600">Failed to load rubric versions: {String(vErr.message)}</p>
      </div>
    )
  }

  const versionParam = sp.version
  let selectedVersionId: number | null = null

  if (typeof versionParam === 'string' && versionParam.trim()) {
    const n = Number(versionParam)
    selectedVersionId = Number.isFinite(n) ? n : null
  }

  const versionList = (versions ?? []) as unknown as VersionRow[]
  const activeVersion = versionList.find((v) => v.active) ?? versionList[0] ?? null
  const selectedVersion =
    (selectedVersionId ? versionList.find((v) => v.id === selectedVersionId) : null) ?? activeVersion

  if (!selectedVersion) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold">Rubric</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No committed rubric found for <span className="font-mono">{selectedAnchor}</span>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask an admin to commit a rubric from <span className="font-mono">/admin/rubric</span>.
        </p>

        {anchors.length ? (
          <div className="mt-6 rounded-xl border p-4 text-sm">
            <div className="font-medium">Available anchors</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {anchors.slice(0, 12).map((a) => (
                <a key={a} className="rounded-lg border px-3 py-2 text-xs" href={`/rubric?anchor=${encodeURIComponent(a)}`}>
                  {a}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  // 3) Load thresholds for the selected version
  const { data: thresholds, error: tErr } = await sb
    .from('ingest_rubric_thresholds_v1')
    .select(
      'metric_name, band, min_value, max_value, inclusive_min, inclusive_max, color_token, report_label_snapshot, format_snapshot'
    )
    .eq('rubric_version_id', selectedVersion.id)

  if (tErr) {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <h1 className="text-2xl font-semibold">Rubric</h1>
        <p className="mt-2 text-sm text-red-600">Failed to load rubric thresholds: {String(tErr.message)}</p>
      </div>
    )
  }

  const rows = (thresholds ?? []) as unknown as ThresholdRow[]
  const byMetric = new Map<string, MetricRubric>()

  for (const r of rows) {
    const key = r.metric_name
    if (!byMetric.has(key)) {
      byMetric.set(key, {
        metric_name: r.metric_name,
        report_label: r.report_label_snapshot,
        format: r.format_snapshot,
        bands: {} as any,
      })
    }
    byMetric.get(key)!.bands[r.band] = r
  }

  const metrics = [...byMetric.values()].sort((a, b) => a.report_label.localeCompare(b.report_label))

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Rubric</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranges are evaluated as <span className="font-mono">min ≤ value &lt; max</span>.
          </p>
        </div>

        <div className="rounded-xl border p-3 text-xs text-muted-foreground">
          <div>
            Scope: <span className="font-mono">{scope}</span> · Source:{' '}
            <span className="font-mono">{source_system}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border">
        <div className="border-b p-4">
          <form className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground">Fiscal Month</label>
              <select
                className="mt-1 rounded-lg border px-3 py-2 text-sm"
                defaultValue={selectedAnchor}
                name="anchor"
              >
                {(anchors.length ? anchors : [selectedAnchor]).map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground">Version</label>
              <select
                className="mt-1 rounded-lg border px-3 py-2 text-sm"
                defaultValue={String(selectedVersion.id)}
                name="version"
              >
                {versionList.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    #{v.id} · {new Date(v.committed_at).toLocaleString()}
                    {v.active ? ' · active' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="rounded-lg border px-4 py-2 text-sm font-semibold">
              View
            </button>

            <div className="ml-auto text-sm">
              <span className="font-medium">Metrics:</span>{' '}
              <span className="text-muted-foreground">{metrics.length}</span>
            </div>
          </form>

          <div className="mt-2 text-xs text-muted-foreground">
            Showing version <span className="font-mono">#{selectedVersion.id}</span> for{' '}
            <span className="font-mono">{selectedVersion.fiscal_month_anchor}</span>
            {selectedVersion.active ? ' (active)' : ''}.
          </div>
        </div>

        {metrics.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No threshold rows found in this rubric version.</div>
        ) : (
          <div className="divide-y">
            {metrics.map((m) => (
              <div key={m.metric_name} className="p-4">
                <div>
                  <div className="font-medium">{m.report_label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{m.metric_name}</span>
                    {m.format ? <> · format: {m.format}</> : null}
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3">Band</th>
                        <th className="py-2 pr-3">Min</th>
                        <th className="py-2 pr-3">Max</th>
                        <th className="py-2 pr-3">Range</th>
                        <th className="py-2 pr-3">Color</th>
                      </tr>
                    </thead>
                    <tbody className="align-top">
                      {BAND_ORDER.map((band) => {
                        const b = m.bands[band]
                        const isNoData = band === 'no_data'
                        return (
                          <tr key={band} className="border-t">
                            <td className="py-3 pr-3 font-medium">{BAND_LABEL[band]}</td>
                            <td className="py-3 pr-3 text-muted-foreground">{isNoData ? '—' : fmt(b?.min_value ?? null)}</td>
                            <td className="py-3 pr-3 text-muted-foreground">{isNoData ? '—' : fmt(b?.max_value ?? null)}</td>
                            <td className="py-3 pr-3 text-muted-foreground">
                              {isNoData ? '—' : <span className="font-mono">[min, max)</span>}
                            </td>
                            <td className="py-3 pr-3">
                              <div className="flex items-center gap-2">
                                <span className={`h-3 w-3 rounded-full ${swatchClass((b?.color_token ?? 'accent_muted') as ColorToken)}`} />
                                <span className="font-mono text-xs text-muted-foreground">{b?.color_token ?? 'accent_muted'}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
