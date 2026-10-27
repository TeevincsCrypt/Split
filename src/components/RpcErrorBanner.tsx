import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { onRetry: () => void }

export default function RpcErrorBanner({ onRetry }: Props) {
  return (
    <div
      className="rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3"
      style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}
    >
      <AlertTriangle className="size-4 shrink-0 mt-0.5 sm:mt-0" style={{ color: 'var(--danger)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
          Couldn&apos;t reach the Arc RPC — history unavailable
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          Set <code className="mono">VITE_SPLIT_RPC_URL</code> to an alternative endpoint, or retry.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="btn-ghost flex items-center gap-1.5 text-xs"
        style={{ padding: '6px 14px' }}
      >
        <RefreshCw className="size-3.5" /> Retry
      </button>
    </div>
  )
}
