import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Percent, SplitSquareHorizontal, ShieldCheck } from 'lucide-react'
import { SplitMark } from '@/components/Layout'

export default function Landing() {
  const steps = [
    { icon: SplitSquareHorizontal, label: 'Define your recipients', desc: 'Add wallet addresses and labels for each contributor.' },
    { icon: Percent, label: 'Set the percentages', desc: 'Assign basis-point allocations that sum to 100%. Preview exact USDC amounts instantly.' },
    { icon: CheckCircle2, label: 'Approve and distribute USDC', desc: 'Approve exactly the required amount, then sign one transaction.' },
    { icon: ShieldCheck, label: 'Verify every payment onchain', desc: 'Every transfer is recorded in a public Distributed event on Arc Testnet.' },
  ]

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-gradient)' }}>
      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-4 pt-20 pb-16 gap-6">
        <div className="mb-2">
          <SplitMark size={52} />
        </div>
        <h1
          className="display font-bold text-4xl sm:text-5xl max-w-lg"
          style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}
        >
          Pay everyone.{' '}
          <span style={{ color: 'var(--accent)' }}>In one move.</span>
        </h1>
        <p className="text-base max-w-md" style={{ color: 'var(--muted)' }}>
          Split turns team payouts into one transparent USDC transaction. Set the percentages,
          review the distribution, and pay every contributor onchain.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/create"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'var(--accent)', color: '#0d1b2f' }}
          >
            Create a split <ArrowRight className="size-4" />
          </Link>
          <Link
            to="/activity"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold transition-all"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}
          >
            Explore activity
          </Link>
        </div>
      </section>

      {/* Fan-out illustration */}
      <section className="flex justify-center px-4 pb-16">
        <FanoutIllustration />
      </section>

      {/* How it works */}
      <section className="px-4 pb-20 max-w-2xl mx-auto w-full">
        <h2
          className="display font-bold text-xl mb-8 text-center"
          style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
        >
          How it works
        </h2>
        <div className="flex flex-col gap-4">
          {steps.map(({ icon: Icon, label, desc }, i) => (
            <div
              key={i}
              className="flex gap-4 p-4 rounded-2xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div
                className="size-10 rounded-xl shrink-0 flex items-center justify-center"
                style={{ background: 'var(--accent-dim)' }}
              >
                <Icon className="size-5" style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--subtle)' }}>
                    0{i + 1}
                  </span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {label}
                  </span>
                </div>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function FanoutIllustration() {
  // Purely illustrative — SVG showing one payment fanning to 4 recipients
  return (
    <div
      className="w-full max-w-sm rounded-3xl p-6"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
    >
      <p className="text-xs text-center mb-4 font-medium" style={{ color: 'var(--subtle)' }}>
        Illustrative — not live data
      </p>
      <svg viewBox="0 0 320 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
        {/* Payer box */}
        <rect x="110" y="10" width="100" height="40" rx="12" fill="rgba(100,217,192,0.15)" stroke="rgba(100,217,192,0.5)" strokeWidth="1.5" />
        <text x="160" y="35" textAnchor="middle" fill="#64d9c0" fontSize="11" fontFamily="DM Sans,sans-serif" fontWeight="600">You pay 100 USDC</text>

        {/* Lines fanning out */}
        <line x1="160" y1="50" x2="40" y2="130" stroke="rgba(100,217,192,0.3)" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1="160" y1="50" x2="110" y2="130" stroke="rgba(100,217,192,0.3)" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1="160" y1="50" x2="210" y2="130" stroke="rgba(100,217,192,0.3)" strokeWidth="1.5" strokeDasharray="4 3" />
        <line x1="160" y1="50" x2="280" y2="130" stroke="rgba(100,217,192,0.3)" strokeWidth="1.5" strokeDasharray="4 3" />

        {/* Recipient boxes */}
        {[
          { x: 10, label: 'Alice', amount: '40' },
          { x: 80, label: 'Bob', amount: '25' },
          { x: 180, label: 'Carol', amount: '20' },
          { x: 250, label: 'Dave', amount: '15' },
        ].map(({ x, label, amount }) => (
          <g key={label}>
            <rect x={x} y="130" width="60" height="40" rx="10" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.12)" strokeWidth="1.2" />
            <text x={x + 30} y="148" textAnchor="middle" fill="#e3ecf9" fontSize="9" fontFamily="DM Sans,sans-serif" fontWeight="500">{label}</text>
            <text x={x + 30} y="162" textAnchor="middle" fill="#64d9c0" fontSize="9.5" fontFamily="DM Sans,sans-serif" fontWeight="700">{amount} USDC</text>
          </g>
        ))}
      </svg>
    </div>
  )
}
