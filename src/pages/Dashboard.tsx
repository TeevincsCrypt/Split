import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { Link } from 'react-router-dom'
import { Plus, ArrowUpRight, Activity, RefreshCw } from 'lucide-react'
import ConnectPrompt from '@/components/ConnectPrompt'
import ContractNotConfigured from '@/components/ContractNotConfigured'
import { ACTIVE_NETWORK } from '@/config/networks'
import { formatUsdcAmount } from '@/lib/allocation'
import { formatAddress, buildExplorerAddress } from '@/lib/utils'
import { useDistributionHistory } from '@/hooks/useDistributionHistory'

export default function Dashboard() {
  const { address, isConnected, chainId } = useAccount()

  if (!ACTIVE_NETWORK.distributorAddress) return <ContractNotConfigured />
  if (!isConnected) return <ConnectPrompt message="Connect your wallet to view your dashboard." />

  const wrongChain = chainId !== ACTIVE_NETWORK.chainId

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Wallet card */}
      <section
        className="rounded-3xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
            Wallet
          </span>
          <a
            href={buildExplorerAddress(address!)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            {formatAddress(address!)} <ArrowUpRight className="size-3" />
          </a>
        </div>
        <UsdcBalanceRow address={address!} />
        <div className="mt-3 flex items-center gap-2">
          <div
            className="size-2 rounded-full"
            style={{ background: wrongChain ? 'var(--danger)' : 'var(--success)' }}
          />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            {wrongChain ? `Wrong network` : ACTIVE_NETWORK.name}
          </span>
        </div>
      </section>

      {/* Stats + CTA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/create"
          className="flex items-center gap-3 p-4 rounded-2xl transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'var(--accent)', color: '#0d1b2f' }}
        >
          <div className="size-9 rounded-xl bg-black/10 flex items-center justify-center shrink-0">
            <Plus className="size-5" />
          </div>
          <div>
            <div className="font-semibold text-sm">New split</div>
            <div className="text-xs opacity-70">Pay contributors now</div>
          </div>
        </Link>
        <Link
          to="/activity"
          className="flex items-center gap-3 p-4 rounded-2xl transition-all hover:scale-[1.01]"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}
        >
          <div
            className="size-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--accent-dim)' }}
          >
            <Activity className="size-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <div className="font-semibold text-sm">Activity</div>
            <div className="text-xs" style={{ color: 'var(--subtle)' }}>All distributions</div>
          </div>
        </Link>
      </div>

      {/* Recent activity for this payer */}
      <RecentDistributions address={address!} />
    </div>
  )
}

function UsdcBalanceRow({ address }: { address: string }) {
  const { data: balance, isLoading } = useReadContract({
    address: ACTIVE_NETWORK.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    chainId: ACTIVE_NETWORK.chainId,
  })

  return (
    <div>
      <div className="text-xs font-medium mb-1" style={{ color: 'var(--subtle)' }}>
        USDC Balance
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
          {isLoading ? '—' : formatUsdcAmount(balance ?? 0n, 2)}
        </span>
        <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
      </div>
    </div>
  )
}

function RecentDistributions({ address }: { address: string }) {
  const { events, loading, rpcError, partial, retry } = useDistributionHistory({ payer: address, limit: 5 })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
          Your distributions
        </span>
        <div className="flex items-center gap-3">
          {rpcError && (
            <button
              onClick={retry}
              className="flex items-center gap-1 text-xs hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              <RefreshCw className="size-3" /> Retry
            </button>
          )}
          {!rpcError && events.length > 0 && (
            <Link to={`/activity?payer=${address}`} className="text-xs hover:underline" style={{ color: 'var(--accent)' }}>
              See all
            </Link>
          )}
        </div>
      </div>
      {loading && (
        <div className="text-sm py-4 text-center" style={{ color: 'var(--subtle)' }}>Loading…</div>
      )}
      {!loading && rpcError && (
        <div
          className="rounded-2xl p-4 text-sm text-center"
          style={{ background: 'var(--surface)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--muted)' }}
        >
          Unavailable — couldn&apos;t reach the Arc RPC
        </div>
      )}
      {!loading && !rpcError && events.length === 0 && (
        <div
          className="rounded-2xl p-4 text-sm text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--subtle)' }}
        >
          No distributions yet
        </div>
      )}
      {!loading && !rpcError && events.length > 0 && (
        <div className="flex flex-col gap-2">
          {events.map((ev) => (
            <Link
              key={ev.distributionId.toString()}
              to={`/d/${ev.distributionId}`}
              className="flex items-center justify-between p-3 rounded-xl transition-colors hover:bg-white/5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  {ev.name || `#${ev.distributionId}`}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                  {ev.recipients.length} recipients
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                  {formatUsdcAmount(ev.totalAmount, 2)} USDC
                </div>
                <div className="text-xs" style={{ color: 'var(--subtle)' }}>
                  #{ev.distributionId.toString()}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {!rpcError && partial && (
        <p className="text-xs mt-2 text-center" style={{ color: 'var(--subtle)' }}>
          History may be partial — RPC range limit reached.
        </p>
      )}
    </section>
  )
}
