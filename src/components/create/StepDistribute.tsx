import { useState } from 'react'
import { ArrowLeft, Loader2, CheckCircle2, ExternalLink, AlertCircle } from 'lucide-react'
import {
  useAccount, useWriteContract, usePublicClient
} from 'wagmi'
import { parseEventLogs, getAddress } from 'viem'
import { type SplitDraft } from '@/pages/CreateSplit'
import { ACTIVE_NETWORK } from '@/config/networks'
import { SPLIT_DISTRIBUTOR_ABI } from '@/abi/SplitDistributor'
import { formatUsdcAmount } from '@/lib/allocation'
import { buildExplorerTx } from '@/lib/utils'

interface Props {
  draft: SplitDraft
  onBack: () => void
  onDistributed: (id: bigint) => void
}

type TxState = 'idle' | 'simulating' | 'pending' | 'confirming' | 'success' | 'error'

export default function StepDistribute({ draft, onBack, onDistributed }: Props) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [txState, setTxState] = useState<TxState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [distributionId, setDistributionId] = useState<bigint | null>(null)

  const { totalAmountParsed: total, rows, name } = draft
  const bpsValues = rows.map((r) => r.bps)
  const recipients = rows.map((r) => getAddress(r.address))
  const contractAddress = ACTIVE_NETWORK.distributorAddress!

  const { writeContractAsync } = useWriteContract()

  async function handleDistribute() {
    if (!total || !publicClient) return
    setErrorMsg(null)
    setTxState('simulating')

    // 1. Simulate first to surface revert reasons
    try {
      await publicClient.simulateContract({
        address: contractAddress,
        abi: SPLIT_DISTRIBUTOR_ABI,
        functionName: 'distribute',
        args: [name, total, recipients, bpsValues as never],
        account: address,
      })
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? 'Simulation failed'
      const revMatch = msg.match(/reverted with reason string '([^']+)'/)
      const errMatch = msg.match(/Error: ([A-Za-z]+)/)
      setErrorMsg(
        revMatch?.[1] ??
        errMatch?.[1] ??
        (msg.includes('insufficient') ? 'Insufficient USDC balance or allowance.' : 'Simulation failed — check your allocation and balances.'),
      )
      setTxState('error')
      return
    }

    // 2. Send tx
    setTxState('pending')
    let hash: string
    try {
      hash = await writeContractAsync({
        address: contractAddress,
        abi: SPLIT_DISTRIBUTOR_ABI,
        functionName: 'distribute',
        args: [name, total, recipients, bpsValues as never],
        chainId: ACTIVE_NETWORK.chainId,
      })
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? ''
      if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('denied')) {
        setTxState('idle')
        return
      }
      setErrorMsg(msg.slice(0, 150))
      setTxState('error')
      return
    }

    setTxHash(hash)
    setTxState('confirming')

    // 3. Wait for receipt
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
      if (receipt.status !== 'success') {
        setErrorMsg('Transaction reverted on-chain. Check explorer for details.')
        setTxState('error')
        return
      }

      // 4. Parse Distributed event from receipt
      const logs = parseEventLogs({
        abi: SPLIT_DISTRIBUTOR_ABI,
        eventName: 'Distributed',
        logs: receipt.logs,
      })
      const distributed = logs[0]?.args?.distributionId
      if (distributed !== undefined) {
        setDistributionId(distributed)
        setTxState('success')
        setTimeout(() => onDistributed(distributed), 1200)
      } else {
        setTxState('success')
        setTimeout(() => onDistributed(0n), 1500)
      }
    } catch {
      // tx submitted but not yet confirmed — do not claim success
      setErrorMsg(null)
      setTxState('confirming')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
        Distribute USDC
      </h2>

      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <Row label="Split" value={name} />
        <Row label="Total" value={`${formatUsdcAmount(total ?? 0n, 2)} USDC`} accent />
        <Row label="Recipients" value={String(rows.length)} />
      </div>

      {/* Status */}
      {txState === 'pending' && (
        <StatusCard icon={<Loader2 className="size-4 animate-spin" />} color="var(--accent)" msg="Waiting for wallet confirmation…" />
      )}
      {txState === 'simulating' && (
        <StatusCard icon={<Loader2 className="size-4 animate-spin" />} color="var(--muted)" msg="Simulating transaction…" />
      )}
      {txState === 'confirming' && (
        <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
            <Loader2 className="size-4 animate-spin" style={{ color: 'var(--accent)' }} />
            Confirming on {ACTIVE_NETWORK.name}…
          </div>
          {txHash && (
            <a
              href={buildExplorerTx(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              View transaction <ExternalLink className="size-3" />
            </a>
          )}
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Transaction submitted. Waiting for confirmation — do not close this window.
          </p>
        </div>
      )}
      {txState === 'success' && (
        <div className="flex flex-col gap-2 p-4 rounded-2xl" style={{ background: 'rgba(141,216,159,0.12)', border: '1px solid rgba(141,216,159,0.3)' }}>
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
            <CheckCircle2 className="size-4" /> Distribution confirmed!
          </div>
          {distributionId !== null && (
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Distribution #{distributionId.toString()}</span>
          )}
          {txHash && (
            <a
              href={buildExplorerTx(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              View on {ACTIVE_NETWORK.name} explorer <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
      {txState === 'error' && errorMsg && (
        <div className="flex items-start gap-2 p-3 rounded-2xl text-sm" style={{ background: 'rgba(232,109,122,0.1)', border: '1px solid rgba(232,109,122,0.3)', color: 'var(--danger)' }}>
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={txState === 'pending' || txState === 'confirming' || txState === 'success'}
          className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold disabled:opacity-40"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        <button
          onClick={() => { void handleDistribute() }}
          disabled={txState === 'pending' || txState === 'confirming' || txState === 'success' || txState === 'simulating'}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
          style={{ background: 'var(--accent)', color: '#0d1b2f' }}
        >
          {txState === 'simulating' ? <><Loader2 className="size-4 animate-spin" /> Simulating…</> :
            txState === 'pending' ? <><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</> :
            txState === 'confirming' ? <><Loader2 className="size-4 animate-spin" /> Confirming…</> :
            txState === 'success' ? <><CheckCircle2 className="size-4" /> Confirmed</> :
            txState === 'error' ? 'Try again' :
            `Distribute ${formatUsdcAmount(total ?? 0n, 2)} USDC`}
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className="font-semibold" style={{ color: accent ? 'var(--accent)' : 'var(--ink-2)' }}>{value}</span>
    </div>
  )
}

function StatusCard({ icon, color, msg }: { icon: React.ReactNode; color: string; msg: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-2xl text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color }}>
      {icon} {msg}
    </div>
  )
}
