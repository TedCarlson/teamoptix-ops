import MetricsUploadClient from "./uploadClient";

export default function MetricsUploadPage() {
  return (
    <main style={{ padding: 40, maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>KPI Upload</h1>
          <p style={{ marginTop: 6, opacity: 0.85 }}>
            Drop a CSV here. Next we’ll identify source, sanitize, map columns, and tag batch dates.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <a
            href="/metrics"
            style={{
              display: "inline-block",
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            ← Back to Metrics
          </a>
        </div>
      </div>

      <MetricsUploadClient />
    </main>
  );
}
