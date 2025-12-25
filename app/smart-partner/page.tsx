import { PageShell, SectionBox } from "@/lib/ui";

export default function Page() {
  return (
    <PageShell>
      <h1 style={{ margin: 0, fontSize: 28 }}>SMART Report (Business Partner)</h1>
      <p style={{ marginTop: 10, opacity: 0.75 }}>
        Landing page placeholder. Content will appear in sections below.
      </p>

      <SectionBox title="Executive Summary" hint="Top-level snapshot for leadership" />
      <SectionBox title="P4P Performance (Track A)" hint="Weighted performance view" />
      <SectionBox title="Legacy / Tie-break Context (Track B)" hint="Appended context alongside P4P" />
    </PageShell>
  );
}
