// app/page.tsx
import React from "react";

const page: React.CSSProperties = {
  padding: 24,
  maxWidth: 980,
  margin: "0 auto",
};

const title: React.CSSProperties = {
  fontSize: 44,
  fontWeight: 850,
  margin: 0,
};

const subtitle: React.CSSProperties = {
  fontSize: 16,
  opacity: 0.8,
  marginTop: 10,
};

const box: React.CSSProperties = {
  padding: 16,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.18)",
  marginTop: 12,
};

const boxTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  opacity: 0.75,
};

const boxBody: React.CSSProperties = {
  marginTop: 10,
  fontSize: 14,
  lineHeight: 1.55,
  opacity: 0.85,
};

export default function HomePage() {
  return (
    <main style={page}>
      <h1 style={title}>Insight</h1>
      <p style={subtitle}>
        Menu-first workspace. Use the hamburger menu to navigate.
      </p>

      <section style={box}>
        <h2 style={boxTitle}>Status</h2>
        <div style={boxBody}>
          DB overhaul in progress. UI is being simplified into landing pages with
          placeholder sections.
        </div>
      </section>

      <section style={box}>
        <h2 style={boxTitle}>Operational Views</h2>
        <div style={boxBody}>
          All operational routes live in the menu (Admin, SMART, Roster, Regions).
          This page intentionally contains no action buttons.
        </div>
      </section>

      <section style={box}>
        <h2 style={boxTitle}>Notes</h2>
        <div style={boxBody}>
          Placeholders will later render role-scoped summaries, links, and
          section data as the DB contracts stabilize.
        </div>
      </section>
    </main>
  );
}
