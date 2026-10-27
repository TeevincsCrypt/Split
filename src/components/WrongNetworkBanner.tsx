import { useAccount, useSwitchChain } from 'wagmi'
import { ACTIVE_NETWORK } from '@/config/networks'

export default function WrongNetworkBanner() {
  const { chainId, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()

  if (!isConnected || chainId === ACTIVE_NETWORK.chainId) return null

  return (
    <div
      className="w-full flex items-center justify-center gap-3 px-4 py-2 text-xs font-semibold"
      style={{
        background: 'var(--danger-bg)',
        borderBottom: '1px solid var(--danger)',
        color: 'var(--danger)',
      }}
    >
      Wrong network — switch to {ACTIVE_NETWORK.name}
      <button
        onClick={() => switchChain({ chainId: ACTIVE_NETWORK.chainId })}
        disabled={isPending}
        className="px-3 py-1 rounded-full text-xs font-bold transition-opacity disabled:opacity-50"
        style={{ background: 'var(--danger)', color: '#fff' }}
      >
        {isPending ? 'Switching…' : 'Switch'}
      </button>
    </div>
  )
}
