import SiteNav from './SiteNav'

export default function ComingSoon(props: { title: string; bullets?: string[] }) {
  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      <SiteNav />

      <h1 style={{ margin: 0, fontSize: 28 }}>{props.title}</h1>
      <p style={{ marginTop: 10, color: '#444' }}>
        Coming soon. This page exists to validate routing + navigation wiring.
      </p>

      {props.bullets?.length ? (
        <>
          <h2 style={{ marginTop: 18, fontSize: 16 }}>Intended content</h2>
          <ul style={{ marginTop: 8, lineHeight: 1.6 }}>
            {props.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}
