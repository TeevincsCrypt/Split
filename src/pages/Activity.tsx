import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ExternalLink, Filter, Loader2 } from 'lucide-react'
import ContractNotConfigured from '@/components/ContractNotConfigured'
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
    events, loading, partial, hasOlder, chainHead, scannedFrom, loadOlder, loadingOlder,
  } = useDistributionHistory({
    payer: configured ? filterPayer || undefined : undefined,
  })

  if (!configured) return <ContractNotConfigured />

  function applyFilter() {
    setFilterPayer(filterInput.trim())
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          Activity
        </h1>
        {!loading && (
          <span className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
            {events.length} distribution{events.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Progress context when not loading from start */}
      {!loading && chainHead > 0n && scannedFrom > ACTIVE_NETWORK.deployBlock && (
        <p className="text-xs" style={{ color: 'var(--subtle)' }}>
          Showing events from block {scannedFrom.toString()} to {chainHead.toString()}.
          {hasOlder ? ' Older events not yet loaded.' : ''}
        </p>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        <div
          className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <Filter className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
          <input
            type="text"
            placeholder="Filter by payer address…"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
            className="flex-1 bg-transparent text-sm outline-none mono placeholder:font-sans placeholder:opacity-40"
            style={{ color: 'var(--ink-2)' }}
          />
        </div>
        <button
          onClick={applyFilter}
          className="px-3 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--accent)', color: '#0d1b2f' }}
        >
          Filter
        </button>
        {filterPayer && (
          <button
            onClick={() => { setFilterPayer(''); setFilterInput('') }}
            className="px-3 py-2 rounded-xl text-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
          >
            Clear
          </button>
        )}
      </div>

      {loading && (
        <div className="text-sm py-4 text-center" style={{ color: 'var(--subtle)' }}>Loading history…</div>
      )}

      {!loading && events.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--subtle)' }}
        >
          {filterPayer ? `No distributions found for ${formatAddress(filterPayer)}.` : 'No distributions yet.'}
        </div>
      )}

      {!loading && events.length > 0 && (
        <div className="flex flex-col gap-2">
          {events.map((ev) => (
            <Link
              key={ev.distributionId.toString()}
              to={`/d/${ev.distributionId}`}
              className="flex items-center justify-between p-4 rounded-2xl transition-colors hover:bg-white/5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                  {ev.name || `Distribution #${ev.distributionId}`}
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
                  Payer: {formatAddress(ev.payer)} · {ev.recipients.length} recipients
                  {ev.timestamp ? ` · ${formatTimestamp(ev.timestamp)}` : ''}
                </div>
              </div>
              <div className="text-right shrink-0 ml-4 flex flex-col items-end gap-1">
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                  {formatUsdcAmount(ev.totalAmount, 2)} USDC
                </span>
                <a
                  href={buildExplorerTx(ev.transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 text-xs hover:underline"
                  style={{ color: 'var(--subtle)' }}
                >
                  #{ev.distributionId.toString()} <ExternalLink className="size-3" />
                </a>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Load older button */}
      {!loading && hasOlder && (
        <button
          onClick={loadOlder}
          disabled={loadingOlder}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          {loadingOlder ? <><Loader2 className="size-4 animate-spin" /> Loading older…</> : 'Load older events'}
        </button>
      )}

      {partial && (
        <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
          History may be partial — some blocks could not be scanned.
        </p>
      )}
    </div>
  )
}
