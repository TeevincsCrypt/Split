import { AlertTriangle } from 'lucide-react'

export default function ContractNotConfigured() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-4 text-center">
      <div
        className="size-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(245,200,66,0.15)' }}
      >
        <AlertTriangle className="size-7" style={{ color: 'var(--warning)' }} />
      </div>
      <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
        Contract not configured
      </h2>
      <p className="text-sm max-w-sm" style={{ color: 'var(--muted)' }}>
        Set <code className="mono text-xs px-1 py-0.5 rounded" style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}>VITE_SPLIT_DISTRIBUTOR_ADDRESS</code> in{' '}
        <code className="mono text-xs">.env</code> and restart the dev server.
      </p>
    </div>
  )
}
