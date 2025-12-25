// app/admin/rubric/page.tsx
import React from 'react'
import { headers, cookies } from 'next/headers'
import RubricEditorClient from './RubricEditor.client'

export const dynamic = 'force-dynamic'

type Band = 'exceed' | 'meet' | 'needs_improvement' | 'unacceptable' | 'no_data'
type ColorToken =
  | 'accent_positive'
  | 'accent_neutral'
  | 'accent_warning'
  | 'accent_critical'
  | 'accent_muted'

type DraftBand = {
  band: Band
  min_value: number | null
  max_value: number | null
  inclusive_min: boolean
  inclusive_max: boolean
  color_token: ColorToken
}

type DraftMetricRubric = {
  metric_name: string
  report_label: string
  format: string
  category: 'p4p' | 'other' | 'both'
  bands: DraftBand[]
}

const DEFAULT_BANDS: DraftBand[] = [
  { band: 'exceed', min_value: null, max_value: null, inclusive_min: true, inclusive_max: false, color_token: 'accent_positive' },
  { band: 'meet', min_value: null, max_value: null, inclusive_min: true, inclusive_max: false, color_token: 'accent_neutral' },
  { band: 'needs_improvement', min_value: null, max_value: null, inclusive_min: true, inclusive_max: false, color_token: 'accent_warning' },
  { band: 'unacceptable', min_value: null, max_value: null, inclusive_min: true, inclusive_max: false, color_token: 'accent_critical' },
  { band: 'no_data', min_value: null, max_value: null, inclusive_min: true, inclusive_max: true, color_token: 'accent_muted' },
]

function deriveCategory(p4p: boolean, other: boolean): DraftMetricRubric['category'] {
  if (p4p && other) return 'both'
  if (p4p) return 'p4p'
  return 'other'
}

function buildOriginFromHeaders(h: Headers) {
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'http'
  return host ? `${proto}://${host}` : ''
}

async function fetchEnabledMetrics(): Promise<
  Array<{
    metric_name: string
    report_label: string
    format: string
    p4p_enabled: boolean
    other_enabled: boolean
  }>
> {
  const h = await headers()
  const origin = buildOriginFromHeaders(h)
  const url = `${origin}/api/ingest/settings`

  const res = await fetch(url, {
    cache: 'no-store',
    headers: { cookie: (await cookies()).toString() },
  })

  if (!res.ok) return []

  const data = (await res.json()) as any
  const rows = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : []

  return rows.map((r: any) => ({
    metric_name: String(r.metric_name ?? r.raw_header_name ?? ''),
    report_label: String(r.report_label ?? r.metric_name ?? ''),
    format: String(r.format ?? ''),
    p4p_enabled: Boolean(r.p4p_enabled),
    other_enabled: Boolean(r.other_enabled),
  }))
}

export default async function AdminRubricPage() {
  const rows = await fetchEnabledMetrics()
  const enabled = rows.filter((m) => m.p4p_enabled || m.other_enabled)

  const initial: DraftMetricRubric[] = enabled.map((m) => ({
    metric_name: m.metric_name,
    report_label: m.report_label,
    format: m.format,
    category: deriveCategory(m.p4p_enabled, m.other_enabled),
    bands: DEFAULT_BANDS.map((b) => ({ ...b })),
  }))

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Admin: Rubric</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft rubric thresholds for enabled metrics (P4P and Other). Commit is intentionally disabled until the
            versioned table is introduced.
          </p>
        </div>
      </div>

      <RubricEditorClient initial={initial} />
    </div>
  )
}
