import { Link } from 'react-router-dom'
import { ArrowRight, ExternalLink } from 'lucide-react'
import { ACTIVE_NETWORK, MAX_RECIPIENTS } from '@/config/networks'

export default function HowItWorks() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">
      <h1 className="display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
        How Split works
      </h1>

      <Section title="Non-custodial atomic flow">
        <p>
          Split never holds your funds. The <code>SplitDistributor</code> contract pulls USDC
          directly from your wallet to each recipient in a single transaction, using{' '}
          <code>safeTransferFrom</code>. Either every recipient receives their share, or nobody
          does — there is no partial success.
        </p>
      </Section>

      <Section title="Approval model">
        <p>
          Before distributing, you approve the contract to spend exactly the distribution amount —
          never unlimited. This approval covers one distribution only and is consumed in that
          transaction.
        </p>
      </Section>

      <Section title="Rounding policy">
        <p>
          Amounts are computed as{' '}
          <code>floor(totalAmount × bps / 10,000)</code> for every recipient except the last, who
          receives the remainder. This guarantees amounts always sum exactly to{' '}
          <code>totalAmount</code> — no dust is lost.
        </p>
      </Section>

      <Section title="Limits">
        <ul className="list-disc list-inside flex flex-col gap-1">
          <li>Maximum {MAX_RECIPIENTS} recipients per distribution</li>
          <li>Allocations in basis points — 1 bp = 0.01%, sum must equal 10,000</li>
          <li>Split name: 1–64 bytes (UTF-8)</li>
          <li>USDC amounts: 6 decimal places (ERC-20 units)</li>
        </ul>
      </Section>

      <Section title="Network">
        <p>
          Split runs on <strong>{ACTIVE_NETWORK.name}</strong> where USDC is both the gas token and
          the payment token. The contract is deployed at:
        </p>
        {ACTIVE_NETWORK.distributorAddress ? (
          <a
            href={`${ACTIVE_NETWORK.explorerBase}/address/${ACTIVE_NETWORK.distributorAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 mono text-xs mt-2 hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            {ACTIVE_NETWORK.distributorAddress} <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>Not configured.</span>
        )}
      </Section>

      <Section title="History via RPC logs">
        <p>
          Activity is loaded by scanning <code>Distributed</code> events from the contract's
          deploy block onwards. On large chains this may be slow or partial if the RPC caps the
          block range per request. The UI always shows a notice when history is partial.
        </p>
      </Section>

      <Section title="Irreversibility">
        <p>
          Blockchain transactions are generally irreversible. Once a distribution is submitted
          and confirmed, the USDC has been transferred. Verify all recipient addresses before
          confirming.
        </p>
      </Section>

      <Section title="Self-host / deploy">
        <p>
          If you want to run your own instance of SplitDistributor — on Arc Mainnet or a
          different testnet — you can deploy the compiled contract directly from your connected
          wallet without pasting a private key anywhere.
        </p>
        <Link
          to="/deploy"
          className="inline-flex items-center gap-1.5 text-sm font-medium mt-1 hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          Open the Deploy page <ArrowRight className="size-3.5" />
        </Link>
      </Section>

      <Link
        to="/create"
        className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold self-start transition-all hover:scale-[1.02]"
        style={{ background: 'var(--accent)', color: '#0d1b2f' }}
      >
        Create a split <ArrowRight className="size-4" />
      </Link>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="display font-semibold text-base mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
        {title}
      </h2>
      <div className="text-sm leading-relaxed flex flex-col gap-2" style={{ color: 'var(--muted)' }}>
        {children}
      </div>
    </section>
  )
}
