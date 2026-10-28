import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Menu, X } from 'lucide-react'
import { ACTIVE_NETWORK } from '@/config/networks'
import { formatAddress } from '@/lib/utils'
import WrongNetworkBanner from './WrongNetworkBanner'

interface LayoutProps { children: React.ReactNode }

const NAV_LINKS = [
  { to: '/dashboard',    label: 'Dashboard' },
  { to: '/create',       label: 'Create split' },
  { to: '/recipients',   label: 'Recipients' },
  { to: '/activity',     label: 'Activity' },
  { to: '/how-it-works', label: 'How it works' },
]

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { address } = useAccount()
  const [menuOpenPath, setMenuOpenPath] = useState<string | null>(null)
  const menuOpen = menuOpenPath === location.pathname
  const menuRef = useRef<HTMLDivElement>(null)

  function toggleMenu() {
    setMenuOpenPath((p) => (p === location.pathname ? null : location.pathname))
  }
  function closeMenu() { setMenuOpenPath(null) }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeMenu() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onPointer(e: PointerEvent) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu()
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen])

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg)' }}>
      <WrongNetworkBanner />

      {/* Header — rounded white bar floating in page margin */}
      <div className="sticky top-0 z-40 px-3 sm:px-5 pt-3 pb-2">
        <header
          className="flex items-center justify-between px-4 sm:px-5 h-14 rounded-2xl"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 no-underline select-none shrink-0">
            <SplitMark size={28} />
            <div className="flex flex-col leading-none">
              <span
                className="display font-bold text-base tracking-tight"
                style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
              >
                Split
              </span>
              <span className="text-[10px] font-medium" style={{ color: 'var(--subtle)' }}>
                USDC payouts on Arc
              </span>
            </div>
          </Link>

          {/* Desktop nav pills — center */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ to, label }) => {
              const active = location.pathname.startsWith(to)
              return (
                <Link
                  key={to}
                  to={to}
                  className="px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all"
                  style={{
                    color: active ? 'var(--accent)' : 'var(--muted)',
                    background: active ? 'var(--accent-dim)' : 'transparent',
                    border: active ? '1px solid var(--accent-mid)' : '1px solid transparent',
                  }}
                >
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Right: wallet pill + hamburger */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Wallet pill */}
            {address ? (
              <div
                className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border)',
                  color: 'var(--ink-2)',
                }}
              >
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ background: 'var(--success)' }}
                />
                {ACTIVE_NETWORK.shortName ?? ACTIVE_NETWORK.name}
                <span className="mono" style={{ color: 'var(--muted)' }}>
                  {formatAddress(address)}
                </span>
              </div>
            ) : null}
            <ConnectKitButton />

            {/* Hamburger — mobile only */}
            <div ref={menuRef} className="md:hidden relative">
              <button
                aria-label="Toggle navigation menu"
                aria-expanded={menuOpen}
                aria-controls="mobile-nav"
                onClick={toggleMenu}
                className="icon-btn"
                style={{ width: 36, height: 36, border: '1px solid var(--border)' }}
              >
                {menuOpen ? <X className="size-4" style={{ color: 'var(--ink)' }} /> : <Menu className="size-4" style={{ color: 'var(--ink)' }} />}
              </button>

              {menuOpen && (
                <nav
                  id="mobile-nav"
                  role="navigation"
                  aria-label="Mobile navigation"
                  className="absolute right-0 top-full mt-2 w-52 rounded-2xl overflow-hidden z-50 flex flex-col py-1.5"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lift)' }}
                >
                  {NAV_LINKS.map(({ to, label }) => {
                    const active = location.pathname.startsWith(to)
                    return (
                      <Link
                        key={to}
                        to={to}
                        onClick={closeMenu}
                        className="px-4 py-2.5 text-sm font-semibold transition-colors"
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
      </div>

      {/* Main */}
      <main className="flex-1">{children}</main>

      {/* Footer — pb-20 on mobile so Arc Studio badge never overlaps */}
      <footer
        className="px-4 sm:px-6 py-8 mt-auto pb-20 sm:pb-8"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <SplitMark size={20} />
            <span className="display font-bold text-sm" style={{ color: 'var(--ink-2)', letterSpacing: '-0.02em' }}>
              Split
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium" style={{ color: 'var(--subtle)' }}>
            <a
              href="https://github.com/teevincscrypt/split"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[--ink-2] transition-colors"
            >
              GitHub
            </a>
            <Link to="/how-it-works" className="hover:text-[--ink-2] transition-colors" style={{ color: 'var(--subtle)' }}>
              How it works
            </Link>
            <a
              href={`${ACTIVE_NETWORK.explorerBase}/address/${ACTIVE_NETWORK.distributorAddress ?? ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[--ink-2] transition-colors"
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

/** Split mark (traced from the brand logo) — fill defaults to brand wine */
export function SplitMark({ size = 28, color = '#641532' }: { size?: number; color?: string }) {
  return (
    <svg
      width={Math.round(size * (107 / 145))}
      height={size}
      viewBox="0 0 107 145"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path fill={color} d="M8.00 47.25 L70.88 10.21 A16 16 0 1 1 79.00 40.00 L22.00 40.00 L22.00 60.00 L99.00 60.00 L99.00 97.75 L36.12 134.79 A16 16 0 1 1 28.00 105.00 L85.00 105.00 L85.00 85.00 L8.00 85.00 Z" />
    </svg>
  )
}
