export default async function RosterEditPage({
  searchParams,
}: {
  searchParams: Promise<{ roster_id?: string }>;
}) {
  const { roster_id } = await searchParams;

  return (
    <main style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
      <a
        href="/roster"
        style={{
          display: "inline-block",
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid #ddd",
          textDecoration: "none",
          fontWeight: 800,
          marginBottom: 16,
        }}
      >
        ← Back to Roster
      </a>

      <h1 style={{ fontSize: 34, fontWeight: 900, marginBottom: 8 }}>
        Add / Update Roster Window
      </h1>

      {!roster_id ? (
        <p style={{ opacity: 0.85 }}>
          No roster_id provided. This will be the “Create New” flow.
        </p>
      ) : (
        <p style={{ opacity: 0.85 }}>
          Editing existing row:{" "}
          <code style={{ fontWeight: 900 }}>{roster_id}</code>
        </p>
      )}
    </main>
  );
}
