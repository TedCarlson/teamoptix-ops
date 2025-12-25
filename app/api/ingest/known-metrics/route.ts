import { NextResponse } from "next/server";

export const runtime = "nodejs";

type MetricDef = {
  metric_name: string;
  format?: "number" | "percent";
  // Optional metadata now, useful later (commit/versioning/registry)
  source_system?: string;
};

const ONTRAC_EXPECTED_HEADERS = [
  "TechId",
  "TechName",
  "Supervisor",
  "Total Jobs",
  "Installs",
  "TCs",
  "SROs",
  "TUResult",
  "TUEligibleJobs",
  "ToolUsage",
  "Promoters",
  "Detractors",
  "tNPS Surveys",
  "tNPS Rate",
  "FTRFailJobs",
  "Total FTR/Contact Jobs",
  "FTR%",
  "48Hr Contact Orders",
  "48Hr Contact Rate%",
  "PHT Jobs",
  "PHT Pure Pass",
  "PHT Fails",
  "PHT RTM",
  "PHT Pass%",
  "PHT Pure Pass%",
  "TotalAppts",
  "TotalMetAppts",
  "MetRate",
  "Rework Count",
  "Rework Rate%",
  "SOI Count",
  "SOI Rate%",
  "Repeat Count",
  "Repeat Rate%",
] as const;

// New: non-Ontrac metrics catalog (pipeline-backed elsewhere)
const INTERNAL_EXPECTED_METRICS = [
  { metric_name: "TSC Contact Rate", format: "percent" },
  { metric_name: "Completion %", format: "percent" },
] as const satisfies readonly MetricDef[];

function detectFormatFromName(name: string): "number" | "percent" {
  return name.trim().endsWith("%") || name.toLowerCase().includes(" rate") ? "percent" : "number";
}

function getCatalog(source_system: string): MetricDef[] | null {
  switch (source_system) {
    case "ontrac":
      return ONTRAC_EXPECTED_HEADERS.map((metric_name) => ({
        metric_name,
        format: detectFormatFromName(metric_name),
        source_system: "ontrac",
      }));
    case "internal":
      return INTERNAL_EXPECTED_METRICS.map((m) => ({
        metric_name: m.metric_name,
        format: m.format ?? detectFormatFromName(m.metric_name),
        source_system: "internal",
      }));
    case "all": {
      // Union catalogs (dedupe by metric_name)
      const all = [
        ...getCatalog("ontrac")!,
        ...getCatalog("internal")!,
      ];
      const byName = new Map<string, MetricDef>();
      for (const m of all) byName.set(m.metric_name, m);
      return [...byName.values()];
    }
    default:
      return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const source_system = (searchParams.get("source_system") || "ontrac").toLowerCase();

  const metrics = getCatalog(source_system);
  if (!metrics) {
    return NextResponse.json(
      { ok: false, error: `Unsupported source_system: ${source_system}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    source_system,
    metrics,
    count: metrics.length,
  });
}
