import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ExternalLink, Copy, Check, ArrowLeft, RefreshCw } from 'lucide-react'
import { ACTIVE_NETWORK } from '@/config/networks'
import { fetchEventById, type DistributionEvent } from '@/lib/history'
import { formatUsdcAmount } from '@/lib/allocation'
import { formatAddress, buildExplorerTx, buildExplorerAddress, formatTimestamp } from '@/lib/utils'
import { buildShareLink } from '@/lib/share'
import ContractNotConfigured from '@/components/ContractNotConfigured'
import { SplitMark } from '@/components/Layout'

export default function Receipt() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<DistributionEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [rpcError, setRpcError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [copiedHash, setCopiedHash] = useState(false)
  const [retryToken, setRetryToken] = useState(0)

  const configured = Boolean(ACTIVE_NETWORK.distributorAddress)

  useEffect(() => {
    if (!id || !configured) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      const [result] = await Promise.all([
        fetchEventById(BigInt(id)),
        buildShareLink(`/d/${id}`).then((link) => { if (!cancelled) setShareLink(link) }),
      ])
      if (cancelled) return
      setEvent(result.event)
      setRpcError(result.rpcError)
      setLoading(false)
    }
    void run()
    return () => { cancelled = true }
  }, [id, configured, retryToken])

  const retry = useCallback(() => setRetryToken((t) => t + 1), [])

  if (!configured) return <ContractNotConfigured />

  function copyHash() {
    if (!event?.transactionHash) return
    void navigator.clipboard.writeText(event.transactionHash)
    setCopiedHash(true)
    setTimeout(() => setCopiedHash(false), 1500)
  }

  function copyShareLink() {
    if (!shareLink) return
    void navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 flex flex-col gap-4">
        <div className="h-40 rounded-3xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />
        <div className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />
      </div>
    )
  }

  if (!loading && rpcError) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 flex flex-col items-center gap-4 text-center">
        <div className="size-14 rounded-full flex items-center justify-center" style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}>
          <SplitMark size={24} />
        </div>
        <p className="text-sm font-bold" style={{ color: 'var(--danger)' }}>
          Couldn&apos;t reach the Arc RPC — history unavailable
        </p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          Set <code className="mono">VITE_SPLIT_RPC_URL</code> to an alternative endpoint, or retry.
        </p>
        <button onClick={retry} className="btn-ghost flex items-center gap-2">
          <RefreshCw className="size-4" /> Retry
        </button>
      </div>
    )
  }

  if (!loading && !event) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 flex flex-col items-center gap-4 text-center">
        <p className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>
          Distribution #{id} not found.
        </p>
        <Link to="/activity" className="btn-primary" style={{ padding: '8px 20px', fontSize: 13 }}>
          Browse activity
        </Link>
      </div>
    )
  }

  if (!event) return null

  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-4">
      <Link
        to="/activity"
        className="flex items-center gap-1.5 text-sm font-semibold w-fit"
        style={{ color: 'var(--muted)' }}
      >
        <ArrowLeft className="size-4" /> Activity
      </Link>

      {/* Hero card */}
      <div
        className="card p-5 flex flex-col gap-1"
        style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
            Distribution #{event.distributionId.toString()}
          </span>
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-bold"
            style={{ background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' }}
          >
            Confirmed
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>$</span>
          <span className="display font-extrabold text-4xl nums" style={{ color: 'var(--accent)', letterSpacing: '-0.04em' }}>
            {formatUsdcAmount(event.totalAmount, 2)}
          </span>
          <span className="text-base font-bold" style={{ color: 'var(--accent)' }}>USDC</span>
        </div>
        <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--accent)' }}>{event.name}</div>
        {event.timestamp && (
          <div className="text-xs font-medium mt-0.5" style={{ color: 'var(--accent)' }}>
            {formatTimestamp(event.timestamp)}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="card p-4 flex flex-col gap-2.5">
        <MetaRow label="Payer">
          <a href={buildExplorerAddress(event.payer)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 mono text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
            {formatAddress(event.payer)} <ExternalLink className="size-3" />
          </a>
        </MetaRow>
        <MetaRow label="Block">
          <span className="mono text-xs font-semibold nums" style={{ color: 'var(--ink-2)' }}>
            {event.blockNumber.toString()}
          </span>
        </MetaRow>
        <MetaRow label="Tx hash">
          <div className="flex items-center gap-2">
            <a href={buildExplorerTx(event.transactionHash)} target="_blank" rel="noopener noreferrer"
              className="mono text-xs font-semibold hover:underline" style={{ color: 'var(--accent)' }}>
              {formatAddress(event.transactionHash)}
            </a>
            <button onClick={copyHash} className="opacity-60 hover:opacity-100 transition-opacity">
              {copiedHash
                ? <Check className="size-3.5" style={{ color: 'var(--success)' }} />
                : <Copy className="size-3.5" style={{ color: 'var(--subtle)' }} />}
            </button>
          </div>
        </MetaRow>
        <MetaRow label="Network">
          <span className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>{ACTIVE_NETWORK.name}</span>
        </MetaRow>
      </div>

      {/* Recipients */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--subtle)' }}>
          Recipients ({event.recipients.length})
        </p>
        <div className="flex flex-col gap-2">
          {event.recipients.map((addr, i) => (
            <div key={addr} className="card px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="size-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                >
                  {i + 1}
                </span>
                <a href={buildExplorerAddress(addr)} target="_blank" rel="noopener noreferrer"
                  className="mono text-xs font-semibold hover:underline truncate" style={{ color: 'var(--muted)' }}>
                  {formatAddress(addr)} <ExternalLink className="size-3 inline" />
                </a>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold nums" style={{ color: 'var(--accent)' }}>
                  {formatUsdcAmount(event.amounts[i], 2)} USDC
                </div>
                <div className="text-xs nums font-semibold" style={{ color: 'var(--subtle)' }}>
                  {(event.bps[i] / 100).toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Share / explorer actions */}
      <div className="flex gap-2">
        <button
          onClick={copyShareLink}
          disabled={!shareLink}
          className="btn-ghost flex-1 justify-center disabled:opacity-40"
        >
          {copied
            ? <><Check className="size-4" style={{ color: 'var(--success)' }} /> Copied</>
            : <><Copy className="size-4" /> Copy link</>}
        </button>
        <a
          href={buildExplorerTx(event.transactionHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-dark flex items-center gap-2"
        >
          Explorer <ExternalLink className="size-4" />
        </a>
      </div>
    </div>
  )
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium" style={{ color: 'var(--subtle)' }}>{label}</span>
      {children}
    </div>
  )
}
