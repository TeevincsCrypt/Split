import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ExternalLink, Filter, Loader2, X } from 'lucide-react'
import ContractNotConfigured from '@/components/ContractNotConfigured'
import RpcErrorBanner from '@/components/RpcErrorBanner'
import { ACTIVE_NETWORK } from '@/config/networks'
import { useDistributionHistory } from '@/hooks/useDistributionHistory'
import { formatUsdcAmount } from '@/lib/allocation'
import { formatAddress, buildExplorerTx, formatTimestamp } from '@/lib/utils'

export default function Activity() {
  const [searchParams] = useSearchParams()
  const [filterPayer, setFilterPayer] = useState(searchParams.get('payer') ?? '')
  const [filterInput, setFilterInput] = useState(searchParams.get('payer') ?? '')

  const configured = Boolean(ACTIVE_NETWORK.distributorAddress)

  const {
    events, loading, rpcError, partial, hasOlder, chainHead, scannedFrom, loadOlder, loadingOlder, retry,
  } = useDistributionHistory({ payer: configured ? filterPayer || undefined : undefined })

  if (!configured) return <ContractNotConfigured />

  function applyFilter() { setFilterPayer(filterInput.trim()) }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Activity
        </h1>
        {!loading && (
          <span
            className="px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            {events.length} distribution{events.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Progress context */}
      {!loading && chainHead > 0n && scannedFrom > ACTIVE_NETWORK.deployBlock && (
        <p className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>
          Showing events from block {scannedFrom.toString()} to {chainHead.toString()}.
          {hasOlder ? ' Older events not yet loaded.' : ''}
        </p>
      )}

      {/* Filter */}
      <div className="card p-3 flex gap-2">
        <div className="flex-1 flex items-center gap-2">
          <Filter className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
          <input
            type="text"
            placeholder="Filter by payer address…"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
            className="flex-1 bg-transparent text-sm outline-none mono font-medium placeholder:font-sans placeholder:opacity-40"
            style={{ color: 'var(--ink-2)' }}
          />
          {filterInput && (
            <button onClick={() => { setFilterInput(''); setFilterPayer('') }} className="opacity-60 hover:opacity-100 transition-opacity">
              <X className="size-4" style={{ color: 'var(--muted)' }} />
            </button>
          )}
        </div>
        <button onClick={applyFilter} className="btn-primary" style={{ padding: '6px 16px', fontSize: 12 }}>
          Filter
        </button>
        {filterPayer && (
          <button
            onClick={() => { setFilterPayer(''); setFilterInput('') }}
            className="chip"
          >
            {formatAddress(filterPayer)} ×
          </button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {[1,2,3].map((i) => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />)}
        </div>
      )}

      {!loading && rpcError && <RpcErrorBanner onRetry={retry} />}

      {!loading && !rpcError && events.length === 0 && (
        <div className="card p-10 text-center text-sm font-medium" style={{ color: 'var(--subtle)' }}>
          {filterPayer ? `No distributions found for ${formatAddress(filterPayer)}.` : 'No distributions yet.'}
        </div>
      )}

      {!loading && !rpcError && events.length > 0 && (
        <div className="flex flex-col gap-2">
          {events.map((ev) => (
            <Link
              key={ev.key}
              to={ev.href}
              className="card px-4 py-3.5 flex items-center justify-between gap-4 hover-lift"
              style={{ cursor: 'pointer' }}
            >
              <div className="min-w-0">
                <div className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>
                  {ev.name || `Distribution #${ev.distributionId}`}
                </div>
                <div className="text-xs mt-0.5 font-medium" style={{ color: 'var(--subtle)' }}>
                  {ev.kind === 'scheduled' ? `Scheduled · payment ${ev.paymentNumber}/${ev.paymentCount} · ` : ''}
                  Payer: {formatAddress(ev.payer)} · {ev.recipients.length} recipients
                  {ev.timestamp ? ` · ${formatTimestamp(ev.timestamp)}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-1">
                <span className="text-sm font-bold nums" style={{ color: 'var(--accent)' }}>
                  {formatUsdcAmount(ev.totalAmount, 2)} USDC
                </span>
                <a
                  href={buildExplorerTx(ev.transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-xs font-semibold hover:underline"
                  style={{ color: 'var(--subtle)' }}
                >
                  {ev.kind === 'scheduled' ? `Schedule #${ev.distributionId.toString()}` : `#${ev.distributionId.toString()}`} <ExternalLink className="size-3" />
                </a>
              </div>
            </Link>
          ))}
        </div>
      )}

      {!loading && !rpcError && hasOlder && (
        <button
          onClick={loadOlder}
          disabled={loadingOlder}
          className="btn-ghost flex items-center justify-center gap-2 w-full disabled:opacity-50"
        >
          {loadingOlder ? <><Loader2 className="size-4 animate-spin" /> Loading older…</> : 'Load older events'}
        </button>
      )}

      {partial && (
        <p className="text-xs text-center font-medium" style={{ color: 'var(--subtle)' }}>
          History may be partial — some blocks could not be scanned.
        </p>
      )}
    </div>
  )
}
