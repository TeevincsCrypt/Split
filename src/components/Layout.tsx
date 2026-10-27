import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Menu, X } from 'lucide-react'
import { ACTIVE_NETWORK } from '@/config/networks'
import { formatAddress } from '@/lib/utils'
import WrongNetworkBanner from './WrongNetworkBanner'

interface LayoutProps {
  children: React.ReactNode
}

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/create', label: 'Create split' },
  { to: '/activity', label: 'Activity' },
  { to: '/how-it-works', label: 'How it works' },
]

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { address } = useAccount()
  // Track the pathname where the menu was opened; a route change auto-closes it
  const [menuOpenPath, setMenuOpenPath] = useState<string | null>(null)
  const menuOpen = menuOpenPath === location.pathname
  const menuRef = useRef<HTMLDivElement>(null)

  function toggleMenu() {
    setMenuOpenPath((p) => (p === location.pathname ? null : location.pathname))
  }
  function closeMenu() {
    setMenuOpenPath(null)
  }

  // Close menu on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close menu on outside click
  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen])

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      <WrongNetworkBanner />

      {/* Header */}
      <header
        className="sticky top-0 z-40 flex items-center justify-between px-4 sm:px-6 h-14 border-b"
        style={{
          background: 'rgba(13,27,47,0.92)',
          backdropFilter: 'blur(16px)',
          borderColor: 'var(--border)',
        }}
      >
        {/* Wordmark */}
        <Link to="/" className="flex items-center gap-2 no-underline select-none">
          <SplitMark />
          <span className="display font-bold text-lg tracking-tight" style={{ color: 'var(--ink)' }}>
            Split
          </span>
        </Link>

        {/* Nav links — always shown on md+, hidden on mobile */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ to, label }) => {
            const active = location.pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  color: active ? 'var(--accent)' : 'var(--muted)',
                  background: active ? 'var(--accent-dim)' : 'transparent',
                }}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Right side: wallet + hamburger */}
        <div className="flex items-center gap-2 sm:gap-3">
          {address && (
            <span className="hidden sm:block text-xs mono" style={{ color: 'var(--subtle)' }}>
              {formatAddress(address)}
            </span>
          )}
          <ConnectKitButton />

          {/* Hamburger — mobile only */}
          <div ref={menuRef} className="md:hidden relative">
            <button
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={toggleMenu}
              className="flex items-center justify-center size-9 rounded-lg transition-colors"
              style={{
                background: menuOpen ? 'var(--accent-dim)' : 'transparent',
                color: menuOpen ? 'var(--accent)' : 'var(--muted)',
              }}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <nav
                id="mobile-nav"
                role="navigation"
                aria-label="Mobile navigation"
                className="absolute right-0 top-full mt-2 w-48 rounded-2xl overflow-hidden shadow-lg z-50 flex flex-col py-1"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                {NAV_LINKS.map(({ to, label }) => {
                  const active = location.pathname.startsWith(to)
                  return (
                    <Link
                      key={to}
                      to={to}
                      className="px-4 py-2.5 text-sm font-medium transition-colors"
                      style={{
                        color: active ? 'var(--accent)' : 'var(--ink-2)',
                        background: active ? 'var(--accent-dim)' : 'transparent',
                      }}
                    >
                      {label}
                    </Link>
                  )
                })}
              </nav>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">{children}</main>

      {/* Footer — pb-16 on mobile so the Arc Studio badge never overlaps */}
      <footer
        className="border-t px-4 sm:px-6 py-6 mt-auto pb-20 sm:pb-6"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <SplitMark size={18} />
            <span className="display font-semibold text-sm" style={{ color: 'var(--ink-2)' }}>
              Split
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs" style={{ color: 'var(--subtle)' }}>
            <a
              href="https://github.com/teevincscrypt/split"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              GitHub
            </a>
            <Link to="/how-it-works" className="hover:underline" style={{ color: 'var(--subtle)' }}>
              How it works
            </Link>
            <a
              href={`${ACTIVE_NETWORK.explorerBase}/address/${ACTIVE_NETWORK.distributorAddress ?? ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              Contract on {ACTIVE_NETWORK.name}
            </a>
          </div>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Blockchain transactions are generally irreversible.
          </p>
        </div>
      </footer>
    </div>
  )
}

function SplitMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="var(--accent-dim)" />
      <rect x="4" y="11" width="7" height="2.5" rx="1.25" fill="var(--accent)" />
      <rect x="13" y="11" width="7" height="2.5" rx="1.25" fill="var(--accent)" />
      <circle cx="12" cy="12.25" r="2" fill="var(--accent)" />
    </svg>
  )
}

export { SplitMark }
