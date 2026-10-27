import { ConnectKitButton } from 'connectkit'
import { Wallet } from 'lucide-react'

export default function ConnectPrompt({ message = 'Connect your wallet to continue.' }: { message?: string }) {
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
      <ConnectKitButton />
    </div>
  )
}
