import { AlertTriangle } from 'lucide-react'
import { ACTIVE_NETWORK } from '@/config/networks'

export default function ContractNotConfigured() {
  const reason = ACTIVE_NETWORK.configError

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 px-4 text-center">
      <div
        className="size-14 rounded-full flex items-center justify-center"
        style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)' }}
      >
        <AlertTriangle className="size-6" style={{ color: 'var(--warning)' }} />
      </div>
      <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
        Contract not configured
      </h2>
      {reason ? (
        <p className="text-sm max-w-sm" style={{ color: 'var(--danger)' }}>{reason}</p>
      ) : (
        <p className="text-sm max-w-sm" style={{ color: 'var(--muted)' }}>
          Set{' '}
          <code className="mono text-xs px-1.5 py-0.5 rounded-md"
            style={{ background: 'var(--surface-muted)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
            VITE_SPLIT_DISTRIBUTOR_ADDRESS
          </code>{' '}
          in <code className="mono text-xs">.env</code> and restart the dev server.
        </p>
      )}
    </div>
  )
}
