import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  onRetry: () => void
}

export default function RpcErrorBanner({ onRetry }: Props) {
  return (
    <div
      className="rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--danger-dim, rgba(239,68,68,0.2))' }}
    >
      <AlertTriangle className="size-5 shrink-0 mt-0.5 sm:mt-0" style={{ color: 'var(--danger, #ef4444)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
          Couldn&apos;t reach the Arc RPC — history unavailable
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          The RPC endpoint returned an error. Set{' '}
          <code className="mono text-xs">VITE_SPLIT_RPC_URL</code> to an alternative endpoint, or retry.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-colors hover:opacity-80"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}
      >
        <RefreshCw className="size-3.5" /> Retry
      </button>
    </div>
  )
}
