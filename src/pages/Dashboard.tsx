import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { Link } from 'react-router-dom'
import { Plus, ArrowUpRight, Activity, RefreshCw, Lock, Calendar, Clock } from 'lucide-react'
import ConnectPrompt from '@/components/ConnectPrompt'
import ContractNotConfigured from '@/components/ContractNotConfigured'
import { ACTIVE_NETWORK } from '@/config/networks'
import { formatUsdcAmount } from '@/lib/allocation'
import { formatAddress, buildExplorerAddress } from '@/lib/utils'
import { useDistributionHistory } from '@/hooks/useDistributionHistory'
import { useScheduleHistory } from '@/hooks/useScheduleHistory'
import { formatCountdown, selectUpcomingSchedules } from '@/lib/schedule'

export default function Dashboard() {
  const { address, isConnected, chainId } = useAccount()

  if (!ACTIVE_NETWORK.distributorAddress) return <ContractNotConfigured />
  if (!isConnected) return <ConnectPrompt message="Connect your wallet to view your dashboard." />

  const wrongChain = chainId !== ACTIVE_NETWORK.chainId

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      {/* Page title */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Dashboard
        </h1>
        <a
          href={buildExplorerAddress(address!)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-semibold hover:underline"
          style={{ color: 'var(--muted)' }}
        >
          {formatAddress(address!)} <ArrowUpRight className="size-3" />
        </a>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

        {/* USDC Balance card */}
        <div className="card p-5 hover-lift">
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--subtle)' }}>
            USDC Balance
          </p>
          <UsdcBalanceRow address={address!} />
        </div>

        {/* Network status card */}
        <div className="card p-5 hover-lift">
          <div className="flex items-start justify-between mb-4">
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
              Network
            </p>
            <div className="icon-btn" style={{ width: 40, height: 40 }}>
              <Lock className="size-4" style={{ color: 'var(--muted)' }} />
            </div>
          </div>
          <p className="display font-bold text-lg" style={{ color: wrongChain ? 'var(--danger)' : 'var(--ink)' }}>
            {wrongChain ? 'Wrong network' : ACTIVE_NETWORK.name}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ background: wrongChain ? 'var(--danger)' : 'var(--success)' }}
            />
            <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
              {wrongChain ? `Switch to ${ACTIVE_NETWORK.name}` : 'Connected'}
            </span>
          </div>
        </div>

        {/* Create split CTA card */}
        <Link
          to="/create"
          className="card p-5 hover-lift flex flex-col justify-between group"
          style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer' }}
        >
          <div
            className="icon-btn mb-4 self-start"
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', boxShadow: 'none' }}
          >
            <Plus className="size-5" style={{ color: '#fff' }} />
          </div>
          <div>
            <p className="font-bold text-base" style={{ color: '#fff' }}>New split</p>
            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Pay contributors now <ArrowUpRight className="size-3" />
            </p>
          </div>
        </Link>

        {/* Activity card */}
        <Link
          to="/activity"
          className="card p-5 hover-lift flex flex-col justify-between"
          style={{ cursor: 'pointer' }}
        >
          <div className="icon-btn mb-4 self-start" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)', boxShadow: 'none' }}>
            <Activity className="size-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="font-bold text-base" style={{ color: 'var(--ink)' }}>Activity</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>All distributions →</p>
          </div>
        </Link>

        {/* Recent distributions — spans 2 cols on lg */}
        <div className="card p-5 sm:col-span-2">
          <RecentDistributions address={address!} />
        </div>

        {/* Upcoming scheduled payments — only when ScheduledSplit is configured */}
        {ACTIVE_NETWORK.scheduledSplitAddress && (
          <div className="card p-5 sm:col-span-2 lg:col-span-3">
            <UpcomingPayments address={address!} />
          </div>
        )}

      </div>
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

  if (isLoading) {
    return <div className="h-8 w-28 rounded-xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />
  }

  const [whole, frac] = formatUsdcAmount(balance ?? 0n, 2).split('.')
  return (
    <div className="flex items-baseline gap-1">
      <span className="text-xs font-bold" style={{ color: 'var(--muted)' }}>$</span>
      <span className="display font-extrabold text-3xl nums" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
        {whole}
      </span>
      <span className="text-base font-bold nums" style={{ color: 'var(--muted)' }}>.{frac}</span>
      <span className="text-xs font-semibold ml-1" style={{ color: 'var(--subtle)' }}>USDC</span>
    </div>
  )
}

function RecentDistributions({ address }: { address: string }) {
  const { events, loading, rpcError, partial, retry } = useDistributionHistory({ payer: address, limit: 5 })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
          Your distributions
        </p>
        <div className="flex items-center gap-3">
          {rpcError && (
            <button onClick={retry} className="flex items-center gap-1 text-xs font-semibold hover:underline"
              style={{ color: 'var(--accent)' }}>
              <RefreshCw className="size-3" /> Retry
            </button>
          )}
          {!rpcError && events.length > 0 && (
            <Link to={`/activity?payer=${address}`} className="text-xs font-semibold hover:underline"
              style={{ color: 'var(--accent)' }}>
              See all →
            </Link>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {[1,2,3].map((i) => (
            <div key={i} className="h-12 rounded-2xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />
          ))}
        </div>
      )}

      {!loading && rpcError && (
        <div className="rounded-2xl p-4 text-sm text-center" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          Unavailable — couldn&apos;t reach the Arc RPC
        </div>
      )}

      {!loading && !rpcError && events.length === 0 && (
        <div className="rounded-2xl p-6 text-sm text-center" style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>
          No distributions yet
        </div>
      )}

      {!loading && !rpcError && events.length > 0 && (
        <div className="flex flex-col gap-2">
          {events.map((ev) => (
            <Link
              key={ev.distributionId.toString()}
              to={`/d/${ev.distributionId}`}
              className="flex items-center justify-between px-4 py-3 rounded-2xl transition-colors"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
              }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {ev.name || `#${ev.distributionId}`}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                  {ev.recipients.length} recipients
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold nums" style={{ color: 'var(--accent)' }}>
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
    </div>
  )
}

function UpcomingPayments({ address: _address }: { address: string }) {
  const { schedules, loading, rpcError, retry } = useScheduleHistory()
  const [now] = useState(() => BigInt(Math.floor(Date.now() / 1000)))

  const upcoming = selectUpcomingSchedules(
    schedules
      .filter((s) => !s.loadError)
      .map((s) => ({
        id: s.id,
        nextDueTime: s.nextDueTime,
        cancelled: s.cancelled,
        executed: s.executed,
        totalPayments: s.dueTimes.length,
      })),
    now,
  ).slice(0, 5)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
          Upcoming payments
        </p>
        <Link to="/schedules" className="flex items-center gap-1 text-xs font-semibold hover:underline"
          style={{ color: 'var(--accent)' }}>
          All schedules <ArrowUpRight className="size-3" />
        </Link>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          <RefreshCw className="size-3 animate-spin" />Loading…
        </div>
      )}

      {rpcError && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--danger)' }}>
          <span>Unavailable — couldn't reach the Arc RPC.</span>
          <button onClick={retry} className="underline">Retry</button>
        </div>
      )}

      {!loading && !rpcError && upcoming.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>No upcoming scheduled payments.</p>
      )}

      {!loading && !rpcError && upcoming.length > 0 && (
        <div className="flex flex-col gap-2">
          {upcoming.map((s) => {
            const ev = schedules.find((sc) => sc.id === s.id)
            if (!ev) return null
            return (
              <Link
                key={s.id.toString()}
                to={`/s/${s.id}`}
                className="flex items-center justify-between py-2 border-b last:border-b-0 hover:opacity-80 transition-opacity"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex items-center gap-2">
                  <div className="icon-btn shrink-0" style={{ width: 32, height: 32, background: 'var(--accent-dim)', boxShadow: 'none', border: 'none' }}>
                    <Calendar className="size-3.5" style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{ev.name}</p>
                    <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>
                      {ev.executed}/{ev.dueTimes.length} · {formatUsdcAmount(ev.amountPerPayment)} USDC
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--muted)' }}>
                  <Clock className="size-3" />
                  {formatCountdown(s.nextDueTime, now)}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
