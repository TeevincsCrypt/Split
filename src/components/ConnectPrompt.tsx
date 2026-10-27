import { ConnectKitButton } from 'connectkit'
import { ArrowLeft } from 'lucide-react'
import { SplitMark } from './Layout'

interface Props {
  message?: string
  onBack?: () => void
}

export default function ConnectPrompt({ message = 'Connect your wallet to continue.', onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-16 px-4 text-center">
      <div
        className="size-16 rounded-full flex items-center justify-center"
        style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}
      >
        <SplitMark size={28} />
      </div>
      <p className="text-sm max-w-xs font-medium" style={{ color: 'var(--muted)' }}>
        {message}
      </p>
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="btn-ghost flex items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
        )}
        <ConnectKitButton />
      </div>
    </div>
  )
}
