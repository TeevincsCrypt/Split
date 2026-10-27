import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ExternalLink, Copy, Check, ArrowLeft, RefreshCw } from 'lucide-react'
import { ACTIVE_NETWORK } from '@/config/networks'
import { fetchEventById, type DistributionEvent } from '@/lib/history'
import { formatUsdcAmount } from '@/lib/allocation'
import { formatAddress, buildExplorerTx, buildExplorerAddress, formatTimestamp } from '@/lib/utils'
import { buildShareLink } from '@/lib/share'
import ContractNotConfigured from '@/components/ContractNotConfigured'

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
      <div className="max-w-xl mx-auto px-4 py-12 text-center text-sm" style={{ color: 'var(--subtle)' }}>
        Loading distribution #{id}…
      </div>
    )
  }

  if (!loading && rpcError) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 flex flex-col items-center gap-4">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          Couldn&apos;t reach the Arc RPC — history unavailable
        </p>
        <p className="text-xs text-center" style={{ color: 'var(--muted)' }}>
          Set <code className="mono">VITE_SPLIT_RPC_URL</code> to an alternative endpoint, or retry.
        </p>
        <button
          onClick={retry}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}
        >
          <RefreshCw className="size-4" /> Retry
        </button>
      </div>
    )
  }

  if (!loading && !event) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 flex flex-col items-center gap-4">
        <p className="text-sm" style={{ color: 'var(--subtle)' }}>Distribution #{id} not found.</p>
        <Link to="/activity" className="text-sm hover:underline" style={{ color: 'var(--accent)' }}>
          Browse activity
        </Link>
      </div>
    )
  }

  // Narrow type — we only reach here when event is non-null
  if (!event) return null

  return (
    <div className="max-w-xl mx-auto px-4 py-8 flex flex-col gap-5">
      <Link to="/activity" className="flex items-center gap-1 text-sm hover:underline" style={{ color: 'var(--subtle)' }}>
        <ArrowLeft className="size-4" /> Activity
      </Link>

      {/* Header */}
      <div className="rounded-3xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
            Distribution #{event.distributionId.toString()}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: 'rgba(141,216,159,0.15)', color: 'var(--success)' }}>
            Confirmed
          </span>
        </div>
        <div className="display text-2xl font-bold tabular-nums mb-1" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          {formatUsdcAmount(event.totalAmount, 2)} USDC
        </div>
        <div className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>{event.name}</div>
        {event.timestamp && (
          <div className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
            {formatTimestamp(event.timestamp)}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <MetaRow label="Payer">
          <a
            href={buildExplorerAddress(event.payer)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 mono text-xs hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            {formatAddress(event.payer)} <ExternalLink className="size-3" />
          </a>
        </MetaRow>
        <MetaRow label="Block">
          <span className="mono text-xs tabular-nums" style={{ color: 'var(--ink-2)' }}>
            {event.blockNumber.toString()}
          </span>
        </MetaRow>
        <MetaRow label="Tx hash">
          <div className="flex items-center gap-2">
            <a
              href={buildExplorerTx(event.transactionHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="mono text-xs hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              {formatAddress(event.transactionHash)}
            </a>
            <button onClick={copyHash} className="transition-opacity hover:opacity-70">
              {copiedHash ? <Check className="size-3" style={{ color: 'var(--success)' }} /> : <Copy className="size-3" style={{ color: 'var(--subtle)' }} />}
            </button>
          </div>
        </MetaRow>
        <MetaRow label="Network">
          <span className="text-xs" style={{ color: 'var(--ink-2)' }}>{ACTIVE_NETWORK.name}</span>
        </MetaRow>
      </div>

      {/* Recipients */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--subtle)' }}>
          Recipients ({event.recipients.length})
        </div>
        <div className="flex flex-col gap-2">
          {event.recipients.map((addr, i) => (
            <div
              key={addr}
              className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <a
                href={buildExplorerAddress(addr)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 mono text-xs hover:underline"
                style={{ color: 'var(--muted)' }}
              >
                {formatAddress(addr)} <ExternalLink className="size-3" />
              </a>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                  {formatUsdcAmount(event.amounts[i], 2)} USDC
                </div>
                <div className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
                  {(event.bps[i] / 100).toFixed(2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Share */}
      <div className="flex gap-2">
        <button
          onClick={copyShareLink}
          disabled={!shareLink}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          {copied ? <><Check className="size-4" style={{ color: 'var(--success)' }} /> Copied</> : <><Copy className="size-4" /> Copy link</>}
        </button>
        <a
          href={buildExplorerTx(event.transactionHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
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
      <span style={{ color: 'var(--subtle)' }}>{label}</span>
      {children}
    </div>
  )
}
