export default function AdminUploadsHubPage() {
  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>Uploads</h1>
      <p style={{ marginTop: 10, opacity: 0.75 }}>
        Choose a source-specific uploader.
      </p>

      <div
        style={{
          marginTop: 12,
          padding: 16,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.75 }}>
          Sources
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <a
            href="/admin/uploads/ontrac"
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.18)",
              textDecoration: "none",
              fontWeight: 800,
              display: "block",
            }}
          >
            Ontrac Upload →
          </a>
        </div>
      </div>
    </main>
  );
}
