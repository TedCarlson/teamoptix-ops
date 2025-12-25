'use client'

import React from 'react'

type Band = 'exceed' | 'meet' | 'needs_improvement' | 'unacceptable' | 'no_data'
type ColorToken =
  | 'accent_positive'
  | 'accent_neutral'
  | 'accent_warning'
  | 'accent_critical'
  | 'accent_muted'

type Direction = 'higher' | 'lower'

type DraftBand = {
  band: Band
  min_input: string
  max_input: string
  inclusive_min: boolean
  inclusive_max: boolean
  color_token: ColorToken
}

type DraftMetricRubric = {
  metric_name: string
  report_label: string
  format: string
  category: 'p4p' | 'other' | 'both'
  direction: Direction
  bands: DraftBand[]
}

type InitialBand = {
  band: Band
  min_value: number | null
  max_value: number | null
  inclusive_min: boolean
  inclusive_max: boolean
  color_token: ColorToken
}

type InitialMetricRubric = {
  metric_name: string
  report_label: string
  format: string
  category: 'p4p' | 'other' | 'both'
  bands: InitialBand[]
}

type VersionResp =
  | {
      ok: true
      scope: string
      source_system: string
      fiscal_month_anchor: string
      version: null
      thresholds: any[]
    }
  | {
      ok: true
      scope: string
      source_system: string
      fiscal_month_anchor: string
      version: {
        id: number
        fiscal_month_anchor: string
        committed_at: string
        committed_by?: string | null
        notes?: string | null
        active: boolean
      }
      thresholds: Array<{
        metric_name: string
        band: Band
        min_value: number | null
        max_value: number | null
        inclusive_min: boolean
        inclusive_max: boolean
        color_token: ColorToken
        report_label_snapshot: string
        format_snapshot: string
      }>
    }
  | { ok: false; error: string }

const BAND_ORDER: Band[] = ['exceed', 'meet', 'needs_improvement', 'unacceptable', 'no_data']

const BAND_LABEL: Record<Band, string> = {
  exceed: 'Exceed Goal',
  meet: 'Meeting Goal',
  needs_improvement: 'Needs Improvement',
  unacceptable: 'Unacceptable',
  no_data: 'No Data',
}

const COLOR_TOKENS: ColorToken[] = [
  'accent_positive',
  'accent_neutral',
  'accent_warning',
  'accent_critical',
  'accent_muted',
]

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

function numberToInput(n: number | null) {
  return n === null || n === undefined ? '' : String(n)
}

export function parseNumericInput(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const normalized = t.startsWith('.') ? `0${t}` : t
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function toDraft(initial: InitialMetricRubric[]): DraftMetricRubric[] {
  return initial.map((m) => ({
    ...m,
    direction: 'higher',
    bands: m.bands.map((b) => ({
      band: b.band,
      min_input: numberToInput(b.min_value),
      max_input: numberToInput(b.max_value),
      inclusive_min: b.inclusive_min,
      inclusive_max: b.inclusive_max,
      color_token: b.color_token,
    })),
  }))
}

function bandMeaning(direction: Direction, band: Band) {
  if (band === 'no_data') return 'Missing / not applicable'
  if (direction === 'higher') {
    switch (band) {
      case 'exceed':
        return 'Higher values are better'
      case 'meet':
        return 'On target'
      case 'needs_improvement':
        return 'Below target'
      case 'unacceptable':
        return 'Far below target'
    }
  } else {
    switch (band) {
      case 'exceed':
        return 'Lower values are better'
      case 'meet':
        return 'On target'
      case 'needs_improvement':
        return 'Above target'
      case 'unacceptable':
        return 'Far above target'
    }
  }
}

function fillTemplate(direction: Direction) {
  if (direction === 'higher') {
    return {
      exceed: { min: '96', max: '' },
      meet: { min: '93', max: '96' },
      needs_improvement: { min: '89', max: '93' },
      unacceptable: { min: '', max: '89' },
    }
  }
  return {
    exceed: { min: '', max: '4' },
    meet: { min: '4', max: '6' },
    needs_improvement: { min: '6', max: '8' },
    unacceptable: { min: '8', max: '' },
  }
}

type CommitBand = {
  band: Band
  min_value: number | null
  max_value: number | null
  inclusive_min: boolean
  inclusive_max: boolean
  color_token: ColorToken
}

type CommitMetric = {
  metric_name: string
  report_label_snapshot: string
  format_snapshot: string
  bands: CommitBand[]
}

function calendarMonthAnchor(dateISO: string) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  const mm = String(m).padStart(2, '0')
  return `${y}-${mm}-01`
}

export default function RubricEditorClient(props: { initial: InitialMetricRubric[] }) {
  const [draft, setDraft] = React.useState<DraftMetricRubric[]>(() => toDraft(props.initial))
  const [showAdvanced, setShowAdvanced] = React.useState(false)

  const [committing, setCommitting] = React.useState(false)
  const [commitError, setCommitError] = React.useState<string | null>(null)
  const [commitOk, setCommitOk] = React.useState<string | null>(null)

  const [loadingCommitted, setLoadingCommitted] = React.useState(false)
  const [committedInfo, setCommittedInfo] = React.useState<string | null>(null)

  const updateBand = React.useCallback(
    (metric_name: string, band: Band, patch: Partial<DraftBand>) => {
      setDraft((prev) =>
        prev.map((m) => {
          if (m.metric_name !== metric_name) return m
          return {
            ...m,
            bands: m.bands.map((b) => (b.band === band ? { ...b, ...patch } : b)),
          }
        })
      )
    },
    []
  )

  const updateDirection = React.useCallback((metric_name: string, direction: Direction) => {
    setDraft((prev) => prev.map((m) => (m.metric_name === metric_name ? { ...m, direction } : m)))
  }, [])

  const applyTemplate = React.useCallback((metric_name: string) => {
    setDraft((prev) =>
      prev.map((m) => {
        if (m.metric_name !== metric_name) return m
        const t = fillTemplate(m.direction)
        return {
          ...m,
          bands: m.bands.map((b) => {
            if (b.band === 'no_data') return b
            const tt = (t as any)[b.band]
            if (!tt) return b
            return { ...b, min_input: tt.min, max_input: tt.max }
          }),
        }
      })
    )
  }, [])

  const resetMetric = React.useCallback((metric_name: string) => {
    setDraft((prev) =>
      prev.map((m) => {
        if (m.metric_name !== metric_name) return m
        return {
          ...m,
          bands: m.bands.map((b) => ({
            ...b,
            min_input: '',
            max_input: '',
            inclusive_min: b.band === 'no_data' ? true : true,
            inclusive_max: b.band === 'no_data' ? true : false,
          })),
        }
      })
    )
  }, [])

  function buildCommitPayload(): { metrics: CommitMetric[] } {
    const metrics: CommitMetric[] = draft.map((m) => {
      const bands: CommitBand[] = BAND_ORDER.map((band) => {
        const b = m.bands.find((x) => x.band === band)!
        const isNoData = band === 'no_data'

        const min_value = isNoData ? null : parseNumericInput(b.min_input)
        const max_value = isNoData ? null : parseNumericInput(b.max_input)

        return {
          band,
          min_value,
          max_value,
          inclusive_min: isNoData ? true : b.inclusive_min,
          inclusive_max: isNoData ? true : b.inclusive_max,
          color_token: b.color_token,
        }
      })

      return {
        metric_name: m.metric_name,
        report_label_snapshot: m.report_label,
        format_snapshot: m.format || 'number',
        bands,
      }
    })

    return { metrics }
  }

  function validateForCommit(payload: { metrics: CommitMetric[] }) {
    for (const m of payload.metrics) {
      const nd = m.bands.find((b) => b.band === 'no_data')
      if (!nd) throw new Error(`Missing no_data band for ${m.metric_name}`)
      if (nd.min_value !== null || nd.max_value !== null) throw new Error(`no_data must have blank min/max for ${m.metric_name}`)

      for (const b of m.bands) {
        if (b.band === 'no_data') continue
        if (b.min_value !== null && b.max_value !== null && b.min_value > b.max_value) {
          throw new Error(`Invalid range for ${m.metric_name} (${b.band}): min > max`)
        }
      }
    }
  }

  const onCommit = async () => {
    setCommitError(null)
    setCommitOk(null)

    try {
      const payload = buildCommitPayload()
      validateForCommit(payload)

      setCommitting(true)

      const res = await fetch('/api/rubric/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'global',
          source_system: 'ontrac',
          metrics: payload.metrics,
        }),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Commit failed (${res.status})`)
      }

      setCommitOk(`Committed rubric_version_id=${json.rubric_version?.id ?? 'unknown'}`)
    } catch (e: any) {
      setCommitError(e?.message ?? String(e))
    } finally {
      setCommitting(false)
    }
  }

  const onLoadCommitted = async () => {
    setCommitError(null)
    setCommitOk(null)
    setCommittedInfo(null)

    try {
      setLoadingCommitted(true)

      const todayISO = new Date().toISOString().slice(0, 10)
      const anchor = calendarMonthAnchor(todayISO)

      const res = await fetch(`/api/rubric/version?anchor=${encodeURIComponent(anchor)}&scope=global&source_system=ontrac`, {
        method: 'GET',
        cache: 'no-store',
      })

      const json = (await res.json().catch(() => null)) as VersionResp | null
      if (!res.ok || !json || (json as any).ok === false) {
        throw new Error((json as any)?.error ?? `Load failed (${res.status})`)
      }

      if (!('version' in json) || !json.version) {
        throw new Error(`No committed rubric found for ${anchor}`)
      }

      const v = json.version
      const rows = (json as any).thresholds as VersionResp extends any ? any[] : any[]

      const byMetricBand = new Map<string, any>()
      for (const r of rows) {
        byMetricBand.set(`${r.metric_name}__${r.band}`, r)
      }

      setDraft((prev) =>
        prev.map((m) => {
          // Only hydrate metrics present in committed snapshot; leave others unchanged
          const anyBand = byMetricBand.get(`${m.metric_name}__exceed`) || byMetricBand.get(`${m.metric_name}__meet`)
          if (!anyBand) return m

          return {
            ...m,
            // Keep labels/formats from Settings (ingredient layer) to avoid “UI drift”.
            // Bands come from committed snapshot:
            bands: m.bands.map((b) => {
              const r = byMetricBand.get(`${m.metric_name}__${b.band}`)
              if (!r) return b
              return {
                ...b,
                min_input: numberToInput(r.min_value ?? null),
                max_input: numberToInput(r.max_value ?? null),
                inclusive_min: Boolean(r.inclusive_min),
                inclusive_max: Boolean(r.inclusive_max),
                color_token: (r.color_token ?? b.color_token) as ColorToken,
              }
            }),
          }
        })
      )

      setCommittedInfo(`Loaded committed version #${v.id} (${new Date(v.committed_at).toLocaleString()})`)
    } catch (e: any) {
      setCommitError(e?.message ?? String(e))
    } finally {
      setLoadingCommitted(false)
    }
  }

  return (
    <div className="mt-6 rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="text-sm">
          <span className="font-medium">Enabled metrics:</span>{' '}
          <span className="text-muted-foreground">{draft.length}</span>
          <div className="mt-1 text-xs text-muted-foreground">
            Range rule: <span className="font-mono">min ≤ value &lt; max</span> (recommended)
          </div>
          {committedInfo ? <div className="mt-1 text-xs text-muted-foreground">{committedInfo}</div> : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="rounded-lg border px-3 py-2 text-xs font-medium"
          >
            {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
          </button>

          <button
            type="button"
            onClick={onLoadCommitted}
            disabled={loadingCommitted || draft.length === 0}
            className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60"
            title="Load the active committed rubric for the current fiscal month into the editor"
          >
            {loadingCommitted ? 'Loading…' : 'Load committed'}
          </button>

          <button
            type="button"
            onClick={onCommit}
            disabled={committing || draft.length === 0}
            className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-60"
            title="Commit current draft rubric for reporting"
          >
            {committing ? 'Committing…' : 'Commit Rubric'}
          </button>
        </div>
      </div>

      {commitError ? <div className="border-b p-4 text-sm text-red-600">{commitError}</div> : null}
      {commitOk ? <div className="border-b p-4 text-sm text-emerald-700">{commitOk}</div> : null}

      {draft.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          No enabled metrics found. Enable at least one metric in Admin → Settings.
        </div>
      ) : (
        <div className="divide-y">
          {draft.map((m) => (
            <div key={m.metric_name} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{m.report_label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{m.metric_name}</span>
                    {m.format ? <> · format: {m.format}</> : null}
                    <> · category: {m.category}</>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="text-xs font-medium text-muted-foreground">Direction</div>

                    <div className="inline-flex overflow-hidden rounded-lg border">
                      <button
                        type="button"
                        onClick={() => updateDirection(m.metric_name, 'higher')}
                        className={`px-3 py-2 text-xs font-medium ${m.direction === 'higher' ? 'bg-black/5' : ''}`}
                      >
                        Higher is better
                      </button>
                      <button
                        type="button"
                        onClick={() => updateDirection(m.metric_name, 'lower')}
                        className={`px-3 py-2 text-xs font-medium ${m.direction === 'lower' ? 'bg-black/5' : ''}`}
                      >
                        Lower is better
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => applyTemplate(m.metric_name)}
                      className="rounded-lg border px-3 py-2 text-xs font-medium"
                    >
                      Fill template
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => resetMetric(m.metric_name)}
                  className="rounded-lg border px-3 py-2 text-xs font-medium"
                >
                  Reset metric
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[1040px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3">Band</th>
                      <th className="py-2 pr-3">Meaning</th>
                      <th className="py-2 pr-3">Min</th>
                      <th className="py-2 pr-3">Max</th>
                      {showAdvanced ? (
                        <>
                          <th className="py-2 pr-3">Inclusive Min</th>
                          <th className="py-2 pr-3">Inclusive Max</th>
                        </>
                      ) : (
                        <th className="py-2 pr-3 text-muted-foreground">Range</th>
                      )}
                      <th className="py-2 pr-3">Color</th>
                    </tr>
                  </thead>

                  <tbody className="align-top">
                    {BAND_ORDER.map((band) => {
                      const b = m.bands.find((x) => x.band === band)!
                      const isNoData = band === 'no_data'

                      return (
                        <tr key={band} className="border-t">
                          <td className="py-3 pr-3 font-medium">{BAND_LABEL[band]}</td>
                          <td className="py-3 pr-3 text-muted-foreground">{bandMeaning(m.direction, band)}</td>

                          <td className="py-3 pr-3">
                            {isNoData ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <input
                                value={b.min_input}
                                onChange={(e) => updateBand(m.metric_name, band, { min_input: e.target.value })}
                                inputMode="decimal"
                                className="w-40 rounded-lg border px-3 py-2 text-sm"
                              />
                            )}
                          </td>

                          <td className="py-3 pr-3">
                            {isNoData ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <input
                                value={b.max_input}
                                onChange={(e) => updateBand(m.metric_name, band, { max_input: e.target.value })}
                                inputMode="decimal"
                                className="w-40 rounded-lg border px-3 py-2 text-sm"
                              />
                            )}
                          </td>

                          {showAdvanced ? (
                            <>
                              <td className="py-3 pr-3">
                                {isNoData ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <label className="inline-flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={b.inclusive_min}
                                      onChange={(e) => updateBand(m.metric_name, band, { inclusive_min: e.target.checked })}
                                    />
                                    <span className="text-muted-foreground">inclusive</span>
                                  </label>
                                )}
                              </td>

                              <td className="py-3 pr-3">
                                {isNoData ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : (
                                  <label className="inline-flex items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={b.inclusive_max}
                                      onChange={(e) => updateBand(m.metric_name, band, { inclusive_max: e.target.checked })}
                                    />
                                    <span className="text-muted-foreground">inclusive</span>
                                  </label>
                                )}
                              </td>
                            </>
                          ) : (
                            <td className="py-3 pr-3 text-muted-foreground">
                              {isNoData ? '—' : <span className="font-mono">[min, max)</span>}
                            </td>
                          )}

                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              <span className={`h-3 w-3 rounded-full ${swatchClass(b.color_token)}`} />
                              <select
                                value={b.color_token}
                                onChange={(e) =>
                                  updateBand(m.metric_name, band, { color_token: e.target.value as ColorToken })
                                }
                                className="rounded-lg border px-3 py-2 text-sm"
                              >
                                {COLOR_TOKENS.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div className="mt-3 text-xs text-muted-foreground">
                  Load committed hydrates band values/colors from the active snapshot for the current month.
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
