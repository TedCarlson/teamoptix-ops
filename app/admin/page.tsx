import React from 'react'
import Link from 'next/link'

const cardStyle: React.CSSProperties = {
    padding: '14px 18px',
    borderRadius: 12,
    border: '1px solid currentColor',
    textDecoration: 'none',
    fontWeight: 800,
    display: 'block',
    opacity: 0.92,
}

export default function AdminHomePage() {
    return (
        <main style={{ padding: 40, maxWidth: 980, margin: '0 auto' }}>
            <h1 style={{ fontSize: 34, fontWeight: 900, margin: 0 }}>Admin</h1>
            <p style={{ marginTop: 8, opacity: 0.85 }}>
                Admin tools and configuration.
            </p>

            <div style={{ display: 'grid', gap: 12, marginTop: 18, maxWidth: 520 }}>
                <Link href="/admin/uploads" style={cardStyle}>
                    Uploads →
                </Link>

                <Link href="/admin/settings" style={cardStyle}>
                    Settings →
                </Link>

                <Link href="/admin/rubric" style={cardStyle}>
                    Rubric →
                </Link>

                <Link href="/smart" style={cardStyle}>
                    Back to SMART →
                </Link>
            </div>
        </main>
    )
}
