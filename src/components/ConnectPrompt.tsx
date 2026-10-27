import { ConnectKitButton } from 'connectkit'
import { Wallet, ArrowLeft } from 'lucide-react'

interface Props {
  message?: string
  /** When set, shows a back button alongside the connect button */
  onBack?: () => void
}

export default function ConnectPrompt({ message = 'Connect your wallet to continue.', onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
      <div
        className="size-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--accent-dim)' }}
      >
        <Wallet className="size-7" style={{ color: 'var(--accent)' }} />
      </div>
      <p className="text-sm max-w-xs" style={{ color: 'var(--muted)' }}>
        {message}
      </p>
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}
          >
            <ArrowLeft className="size-4" /> Back
          </button>
        )}
        <ConnectKitButton />
      </div>
    </div>
  )
}
