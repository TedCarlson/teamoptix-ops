import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 48, fontWeight: 800, marginBottom: 8 }}>
        Insight
      </h1>

      <p style={{ fontSize: 18, opacity: 0.85, marginBottom: 24 }}>
        Precision KPI visibility + Roster management
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 320 }}>
        <Link
          href="/roster"
          style={{
            padding: "14px 18px",
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            fontWeight: 700,
            display: "inline-block",
          }}
        >
          Roster Management →
        </Link>

        <Link
          href="/kpi"
          style={{
            padding: "14px 18px",
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            fontWeight: 700,
            display: "inline-block",
          }}
        >
          KPI Reports →
        </Link>

        <Link
          href="/route-lock"
          style={{
            padding: "14px 18px",
            borderRadius: 12,
            border: "1px solid #ddd",
            textDecoration: "none",
            fontWeight: 700,
            display: "inline-block",
          }}
        >
          Route Lock →
        </Link>
      </div>
    </main>
  );
}
