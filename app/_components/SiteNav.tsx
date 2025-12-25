// app/_components/SiteNav.tsx
'use client'

import React from 'react'

function usePrefersDark() {
  const [dark, setDark] = React.useState(false)

  React.useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return

    const apply = () => setDark(!!mq.matches)
    apply()

    if ((mq as any).addEventListener) (mq as any).addEventListener('change', apply)
    else (mq as any).addListener(apply)

    return () => {
      if ((mq as any).removeEventListener) (mq as any).removeEventListener('change', apply)
      else (mq as any).removeListener(apply)
    }
  }, [])

  return dark
}

const menuButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.12)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
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
  const prefersDark = usePrefersDark()

  const scrimStyle: React.CSSProperties = React.useMemo(
    () => ({
      position: 'fixed',
      inset: 0,
      zIndex: 40,
      background: prefersDark ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.22)',
      backdropFilter: 'blur(2px)',
      WebkitBackdropFilter: 'blur(2px)',
    }),
    [prefersDark]
  )

  const panelStyle: React.CSSProperties = React.useMemo(
    () => ({
      position: 'absolute',
      top: 46,
      left: 0,
      zIndex: 50,
      borderRadius: 12,
      padding: 10,
      maxWidth: 360,
      minWidth: 240,

      background: prefersDark ? 'rgba(18,18,18,0.88)' : 'rgba(255,255,255,0.92)',
      color: prefersDark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.88)',
      border: prefersDark ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(0,0,0,0.12)',
      boxShadow: prefersDark ? '0 16px 50px rgba(0,0,0,0.65)' : '0 16px 50px rgba(0,0,0,0.18)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    }),
    [prefersDark]
  )

  const linkStyle: React.CSSProperties = React.useMemo(
    () => ({
      display: 'block',
      padding: '10px 12px',
      borderRadius: 10,
      textDecoration: 'none',
      color: 'inherit',
      fontSize: 14,
    }),
    []
  )

  const linkHoverBg = prefersDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => setOpen(false)

  const onLinkEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.background = linkHoverBg
  }
  const onLinkLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.background = 'transparent'
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...menuButton,
          border: prefersDark ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(0,0,0,0.12)',
        }}
        aria-label="Open navigation menu"
        aria-expanded={open}
      >
        <MenuIcon />
      </button>

      {open ? <div style={scrimStyle} onClick={close} /> : null}

      {open ? (
        <div style={panelStyle}>
          <div style={sectionLabel}>Core</div>
          <a href="/" style={linkStyle} onClick={close} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            Home
          </a>
          <a href="/smart" style={linkStyle} onClick={close} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            SMART (Internal)
          </a>
          <a
            href="/smart-partner"
            style={linkStyle}
            onClick={close}
            onMouseEnter={onLinkEnter}
            onMouseLeave={onLinkLeave}
          >
            SMART (Partner)
          </a>
          <a href="/metrics" style={linkStyle} onClick={close} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            Metrics (Current)
          </a>

          <div style={sectionLabel}>Org</div>
          <a href="/regions" style={linkStyle} onClick={close} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            Regions
          </a>
          <a
            href="/region/Keystone"
            style={linkStyle}
            onClick={close}
            onMouseEnter={onLinkEnter}
            onMouseLeave={onLinkLeave}
          >
            Region: Keystone
          </a>

          <div style={sectionLabel}>Admin</div>
          <a href="/admin" style={linkStyle} onClick={close} onMouseEnter={onLinkEnter} onMouseLeave={onLinkLeave}>
            Admin
          </a>
        </div>
      ) : null}
    </div>
  )
}
