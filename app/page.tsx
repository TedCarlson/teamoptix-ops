import Link from "next/link";

const cardStyle: React.CSSProperties = {
  padding: "14px 18px",
  borderRadius: 12,
  border: "1px solid currentColor",
  textDecoration: "none",
  fontWeight: 700,
  display: "block",
  opacity: 0.92,
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  opacity: 0.75,
  marginTop: 22,
  marginBottom: 10,
};

export default function HomePage() {
  return (
    <main style={{ padding: 40, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ fontSize: 44, fontWeight: 850, marginBottom: 8 }}>
        Insight
      </h1>

      <p style={{ fontSize: 16, opacity: 0.85, marginBottom: 18 }}>
        Precision KPI visibility + roster, uploads, and reporting.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, maxWidth: 520 }}>
        <div>
          <div style={sectionTitle}>Role menu</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <Link href="/smart" style={cardStyle}>
              SMART Report (Internal) →
            </Link>
            <Link href="/smart-partner" style={cardStyle}>
              SMART Report (Business Partner) →
            </Link>
            <Link href="/admin" style={cardStyle}>
              Admin →
            </Link>
          </div>
        </div>

        <div>
          <div style={sectionTitle}>Core tools</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <Link href="/metrics" style={cardStyle}>
              Metrics (Current) →
            </Link>
            <Link href="/roster" style={cardStyle}>
              Roster →
            </Link>
            <Link href="/route-lock" style={cardStyle}>
              Route Lock →
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
          <div><b>Note:</b> Role-based routing and permissions will be driven by <code>roster_v2</code>.</div>
          <div>For now, these links establish the page map and navigation skeleton.</div>
        </div>
      </div>
    </main>
  );
}
