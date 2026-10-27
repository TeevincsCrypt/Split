import { useAccount, useSwitchChain } from 'wagmi'
import { ACTIVE_NETWORK } from '@/config/networks'
import { AlertTriangle } from 'lucide-react'

export default function WrongNetworkBanner() {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === ACTIVE_NETWORK.chainId) return null

  return (
    <div
      className="w-full flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-medium"
      style={{ background: 'rgba(232,109,122,0.15)', borderBottom: '1px solid rgba(232,109,122,0.3)' }}
    >
      <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />
      <span style={{ color: 'var(--ink-2)' }}>
        Wrong network — please switch to {ACTIVE_NETWORK.name}
      </span>
      <button
        onClick={() => switchChain({ chainId: ACTIVE_NETWORK.chainId })}
        disabled={isPending}
        className="px-3 py-1 rounded-lg text-xs font-semibold transition-opacity disabled:opacity-50"
        style={{ background: 'var(--danger)', color: '#fff' }}
      >
        {isPending ? 'Switching…' : 'Switch'}
      </button>
    </div>
  )
}
