import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, ShieldCheck } from 'lucide-react'
import { ACTIVE_NETWORK } from '@/config/networks'

export default function Landing() {
  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      {/* ── Hero band ────────────────────────────────────────────── */}
      <section
        className="px-4 sm:px-6 pt-6 pb-8 max-w-5xl mx-auto"
      >
        <div
          className="rounded-3xl px-6 sm:px-10 py-10 sm:py-12 flex flex-col sm:flex-row items-start sm:items-center gap-8"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}
        >
          {/* Left: date tile + CTA */}
          <div className="flex flex-col gap-5 shrink-0">
            <div
              className="flex items-center justify-center rounded-2xl"
              style={{
                width: 140,
                height: 140,
                background: 'var(--accent-dim)',
                border: '1px solid var(--accent-mid)',
              }}
            >
              <div className="flex flex-col items-center gap-1">
                <span className="display font-bold text-4xl nums" style={{ color: 'var(--accent)' }}>1 tx</span>
                <span className="text-xs font-semibold text-center leading-tight" style={{ color: 'var(--accent)', maxWidth: 80 }}>
                  → every contributor
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Link to="/create" className="btn-primary">
                Create a split <ArrowRight className="size-4" />
              </Link>
              <Link to="/activity" className="btn-ghost">
                Explore activity
              </Link>
            </div>
          </div>

          {/* Right: headline */}
          <div className="flex flex-col gap-3">
            <h1
              className="display font-extrabold leading-tight"
              style={{ color: 'var(--ink)', fontSize: 'clamp(2rem, 5vw, 3.25rem)', letterSpacing: '-0.04em' }}
            >
              Pay everyone.{'\n'}
              <span style={{ color: 'var(--accent)' }}>In one move.</span>
            </h1>
            <p className="text-base leading-relaxed max-w-md" style={{ color: 'var(--muted)' }}>
              Split turns team payouts into one transparent USDC transaction.
              Set the percentages, approve once, and pay every contributor onchain.
            </p>
          </div>
        </div>
      </section>

      {/* ── Bento grid ───────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 pb-12 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Card 1: one-to-many illustration */}
          <BentoCard className="sm:col-span-2 lg:col-span-1">
            <ExampleLabel />
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--subtle)' }}>
              One payment → four recipients
            </p>
            <div className="flex flex-col gap-2">
              {([
                { label: 'Alice', pct: '40%', amt: '40.00', w: '100%' },
                { label: 'Bob',   pct: '25%', amt: '25.00', w: '62%' },
                { label: 'Carol', pct: '20%', amt: '20.00', w: '50%' },
                { label: 'Dave',  pct: '15%', amt: '15.00', w: '37%' },
              ] as { label: string; pct: string; amt: string; w: string }[]).map(({ label, pct, amt, w }) => (
                <div key={label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>{label}</span>
                    <span className="nums font-bold" style={{ color: 'var(--ink)' }}>{amt} USDC</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'var(--surface-muted)' }}>
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: w, background: 'var(--accent)' }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold" style={{ color: 'var(--subtle)' }}>{pct}</span>
                </div>
              ))}
            </div>
            <div
              className="mt-4 pt-3 flex items-center justify-between text-xs font-bold"
              style={{ borderTop: '1px solid var(--border)' }}
            >
              <span style={{ color: 'var(--muted)' }}>Total</span>
              <span className="nums" style={{ color: 'var(--accent)' }}>100.00 USDC</span>
            </div>
          </BentoCard>

          {/* Card 2: concentric circles visual */}
          <BentoCard>
            <ExampleLabel />
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--subtle)' }}>
              Share breakdown
            </p>
            <div className="flex items-center justify-center py-2">
              <ConcentricRings />
            </div>
          </BentoCard>

          {/* Card 3: non-custodial features */}
          <BentoCard>
            <div
              className="icon-btn mb-4"
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}
            >
              <ShieldCheck className="size-5" style={{ color: 'var(--accent)' }} />
            </div>
            <p className="font-bold text-sm mb-1" style={{ color: 'var(--ink)' }}>Non-custodial</p>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
              The contract pulls USDC directly wallet-to-wallet. Split never holds your funds — atomic, ownerless, and fully onchain.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {(['Atomic', 'Ownerless', 'Arc Testnet'] as string[]).map((tag) => (
                <span key={tag} className="chip">{tag}</span>
              ))}
            </div>
          </BentoCard>

          {/* Card 4: How it works stepper */}
          <BentoCard className="sm:col-span-2 lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--subtle)' }}>
              How it works
            </p>
            <div className="flex flex-col gap-0">
              {([
                { n: '01', label: 'Define recipients', desc: 'Add wallet addresses and labels for each contributor.' },
                { n: '02', label: 'Set allocations', desc: 'Assign basis-point percentages that sum to 100%.' },
                { n: '03', label: 'Approve USDC', desc: 'Approve exactly the required amount — not unlimited.' },
                { n: '04', label: 'Distribute', desc: 'Sign one transaction. Every recipient is paid atomically.' },
              ] as { n: string; label: string; desc: string }[]).map(({ n, label, desc }, i, arr) => (
                <div key={n} className="flex gap-4">
                  {/* Stepper line */}
                  <div className="flex flex-col items-center">
                    <div
                      className="size-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                      style={{ background: 'var(--accent)', color: '#fff' }}
                    >
                      {n}
                    </div>
                    {i < arr.length - 1 && (
                      <div className="w-px flex-1 my-1" style={{ background: 'var(--border)' }} />
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-5">
                    <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Card 5: Verify onchain */}
          <BentoCard>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--subtle)' }}>
              Verify onchain
            </p>
            <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--muted)' }}>
              Every distribution emits a public <code className="mono text-[10px]">Distributed</code> event.
              Inspect it on the Arc Testnet explorer.
            </p>
            {ACTIVE_NETWORK.distributorAddress ? (
              <a
                href={`${ACTIVE_NETWORK.explorerBase}/address/${ACTIVE_NETWORK.distributorAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost flex items-center gap-1.5 text-xs w-fit"
                style={{ padding: '6px 14px' }}
              >
                View contract <ArrowUpRight className="size-3.5" />
              </a>
            ) : (
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>Contract not configured.</span>
            )}
          </BentoCard>

        </div>
      </section>
    </div>
  )
}

function BentoCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`card p-5 hover-lift ${className}`}
      style={{ borderRadius: 'var(--r-card)' }}
    >
      {children}
    </div>
  )
}

function ExampleLabel() {
  return (
    <span
      className="inline-block mb-3 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
      style={{ background: 'var(--surface-muted)', color: 'var(--subtle)', border: '1px solid var(--border)' }}
    >
      Example
    </span>
  )
}

/** Concentric rings SVG representing 40/25/20/15 shares */
function ConcentricRings() {
  const rings = [
    { r: 64, label: 'Alice', pct: '40%', color: '#641532' },
    { r: 50, label: 'Bob',   pct: '25%', color: '#A94B6A' },
    { r: 38, label: 'Carol', pct: '20%', color: '#D99BB0' },
    { r: 26, label: 'Dave',  pct: '15%', color: '#F7E9EE' },
  ]
  return (
    <div className="flex items-center gap-6">
      <svg width="140" height="140" viewBox="0 0 140 140">
        {rings.map(({ r, color }) => (
          <circle key={r} cx="70" cy="70" r={r} fill={color} />
        ))}
      </svg>
      <div className="flex flex-col gap-2">
        {rings.map(({ label, pct, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full shrink-0" style={{ background: color, border: '1px solid var(--border)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{label}</span>
            <span className="text-xs nums font-bold ml-auto" style={{ color: 'var(--muted)' }}>{pct}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
