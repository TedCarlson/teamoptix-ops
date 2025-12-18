import Link from "next/link";

export default function Page() {
  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Metrics</h1>
      <p style={{ marginTop: 8, opacity: 0.85 }}>
        Coming soon. This space will hold future metrics tools and features.
      </p>

      <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
        <Link href="/smart" style={btn}>
          Go to SMART
        </Link>
        <Link href="/admin" style={btn}>
          Admin
        </Link>
      </div>

      <div style={{ marginTop: 22, opacity: 0.7, fontSize: 13 }}>
        Note: legacy metrics routes are currently disabled under <code>app/_legacy_metrics__disabled</code>.
      </div>
    </main>
  );
}

const btn: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #ddd",
  textDecoration: "none",
  fontWeight: 900,
};
