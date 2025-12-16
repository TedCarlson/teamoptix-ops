'use client'

import React from 'react'

const menuButton: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
}

const panel: React.CSSProperties = {
    position: 'absolute',
    top: 46,
    left: 0,
    zIndex: 50,
    border: '1px solid rgba(255,255,255,0.14)',
    borderRadius: 12,
    padding: 10,
    background: 'rgba(0,0,0,0.85)', // if your theme already sets a background, change to 'transparent'
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    maxWidth: 360,
    minWidth: 240,
}

const linkStyle: React.CSSProperties = {
    display: 'block',
    padding: '10px 12px',
    borderRadius: 10,
    textDecoration: 'none',
    color: 'inherit',
    fontSize: 14,
}

const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    opacity: 0.7,
    margin: '10px 0 6px',
}

function MenuIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <path
                d="M3 5h14M3 10h14M3 15h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    )
}

export default function SiteNav() {
    const [open, setOpen] = React.useState(false)
    const rootRef = React.useRef<HTMLDivElement | null>(null)

    // Close on click outside
    React.useEffect(() => {
        if (!open) return
        const onDown = (e: MouseEvent) => {
            if (!rootRef.current) return
            if (!rootRef.current.contains(e.target as Node)) setOpen(false)
        }
        window.addEventListener('mousedown', onDown)
        return () => window.removeEventListener('mousedown', onDown)
    }, [open])

    // Close on ESC
    React.useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    const close = () => setOpen(false)

    return (
        <div ref={rootRef} style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                style={menuButton}
                aria-label="Open navigation menu"
                aria-expanded={open}
            >
                <MenuIcon />
            </button>

            {open ? (
                <div style={panel}>
                    <div style={sectionLabel}>Core</div>
                    <a href="/" style={linkStyle} onClick={close}>Home</a>
                    <a href="/smart" style={linkStyle} onClick={close}>SMART (Internal)</a>
                    <a href="/smart-partner" style={linkStyle} onClick={close}>SMART (Partner)</a>
                    <a href="/metrics" style={linkStyle} onClick={close}>Metrics (Current)</a>

                    <div style={sectionLabel}>Org</div>
                    <a href="/regions" style={linkStyle} onClick={close}>Regions</a>
                    <a href="/region/Keystone" style={linkStyle} onClick={close}>Region: Keystone</a>

                    <div style={sectionLabel}>Admin</div>
                    <a href="/admin" style={linkStyle} onClick={close}>Admin</a>
                    <a href="/admin/uploads" style={linkStyle} onClick={close}>Admin: Uploads</a>
                    <a href="/admin/settings" style={linkStyle} onClick={close}>Admin: Settings</a>
                </div>
            ) : null}
        </div>
    )
}
