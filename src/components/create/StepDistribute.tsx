import { useState } from 'react'
import { ArrowLeft, Loader2, CheckCircle2, ExternalLink, AlertCircle, RefreshCw } from 'lucide-react'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { parseEventLogs, getAddress, BaseError, ContractFunctionRevertedError } from 'viem'
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

type TxState = 'idle' | 'simulating' | 'pending' | 'confirming' | 'success' | 'unconfirmed' | 'error'

const RECEIPT_TIMEOUT_MS = 120_000

/** Safe stringifier for unknown error arg values */
function s(v: unknown): string {
  if (v === null || v === undefined) return '?'
  if (typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'string') return v
  return '?'
}

/**
 * Decode a viem error into a friendly message, mapping SplitDistributor custom errors
 * and ERC-20 insufficient allowance/balance.
 */
function decodeError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName
      const args = revert.data?.args as unknown[] | undefined
      switch (name) {
        case 'ZeroAmount': return 'Total amount must be greater than zero.'
        case 'NoRecipients': return 'At least one recipient is required.'
        case 'TooManyRecipients': return `Too many recipients (max 50, got ${s(args?.[0])}).`
        case 'InvalidName': return 'Distribution name must be between 1 and 64 characters.'
        case 'LengthMismatch': return 'Recipients and allocations arrays have different lengths.'
        case 'InvalidAllocationTotal': return `Allocations must sum to 10,000 bps (got ${s(args?.[0])}).`
        case 'InvalidRecipient': return `Invalid recipient at index ${s(args?.[0])}.`
        case 'DuplicateRecipient': return `Duplicate recipient at index ${s(args?.[0])}.`
        case 'ZeroAllocation': return `Zero allocation at index ${s(args?.[0])}.`
        case 'AllocationRoundsToZero': return `Allocation rounds to zero at index ${s(args?.[0])} — increase the total amount.`
        case 'ERC20InsufficientAllowance': return 'Insufficient USDC allowance. Go back and re-approve.'
        case 'ERC20InsufficientBalance': return 'Insufficient USDC balance for this distribution.'
        case 'SafeERC20FailedOperation': return 'USDC transfer failed — a recipient may be on the USDC blocklist.'
        case 'ReentrancyGuardReentrantCall': return 'Reentrancy detected.'
        default:
          if (name) return `Contract error: ${name}`
      }
    }
  }
  const msg: string = (err as Error)?.message ?? 'Unknown error'
  if (msg.toLowerCase().includes('insufficient allowance')) return 'Insufficient USDC allowance. Go back and re-approve.'
  if (msg.toLowerCase().includes('insufficient balance')) return 'Insufficient USDC balance.'
  if (msg.includes('User denied') || msg.includes('user rejected')) return '' // silently cancel
  return msg.slice(0, 200)
}

export default function StepDistribute({ draft, onBack, onDistributed }: Props) {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient({ chainId: ACTIVE_NETWORK.chainId })
  const [txState, setTxState] = useState<TxState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [distributionId, setDistributionId] = useState<bigint | null>(null)

  const { totalAmountParsed: total, rows, name } = draft
  const trimmedName = name.trim()
  const bpsValues = rows.map((r) => r.bps)
  const recipients = rows.map((r) => getAddress(r.address))
  const contractAddress = ACTIVE_NETWORK.distributorAddress!

  // Wrong-network guard
  const wrongChain = chainId !== ACTIVE_NETWORK.chainId

  const { writeContractAsync } = useWriteContract()

  async function pollReceipt(hash: `0x${string}`) {
    if (!publicClient) return
    setTxState('confirming')
    const deadline = Date.now() + RECEIPT_TIMEOUT_MS
    let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>> | null = null
    try {
      receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: RECEIPT_TIMEOUT_MS,
      })
    } catch {
      // Timeout or network error
      if (Date.now() >= deadline - 1000) {
        setTxState('unconfirmed')
      } else {
        setErrorMsg('Confirmation check failed. Use "Check again" to retry.')
        setTxState('unconfirmed')
      }
      return
    }

    if (receipt.status !== 'success') {
      setErrorMsg('Transaction was reverted on-chain.')
      setTxState('error')
      return
    }

    // Parse Distributed event from this distributor address only
    const logs = parseEventLogs({
      abi: SPLIT_DISTRIBUTOR_ABI,
      eventName: 'Distributed',
      logs: receipt.logs.filter(
        (l) => l.address.toLowerCase() === contractAddress.toLowerCase(),
      ),
    })
    const distributed = logs[0]?.args?.distributionId
    if (distributed === undefined) {
      setErrorMsg(
        'Transaction succeeded but no Distributed event was found. This is unexpected. Check the explorer.',
      )
      setTxState('error')
      return
    }

    setDistributionId(distributed)
    setTxState('success')
    setTimeout(() => onDistributed(distributed), 1200)
  }

  async function handleDistribute() {
    if (!total || !publicClient || wrongChain) return
    setErrorMsg(null)
    setTxState('simulating')

    // Simulate first
    try {
      await publicClient.simulateContract({
        address: contractAddress,
        abi: SPLIT_DISTRIBUTOR_ABI,
        functionName: 'distribute',
        args: [trimmedName, total, recipients, bpsValues as never],
        account: address,
      })
    } catch (err: unknown) {
      const msg = decodeError(err)
      setErrorMsg(msg || 'Simulation failed — check your allocation and balances.')
      setTxState('error')
      return
    }

    setTxState('pending')
    let hash: `0x${string}`
    try {
      hash = await writeContractAsync({
        address: contractAddress,
        abi: SPLIT_DISTRIBUTOR_ABI,
        functionName: 'distribute',
        args: [trimmedName, total, recipients, bpsValues as never],
        chainId: ACTIVE_NETWORK.chainId,
      })
    } catch (err: unknown) {
      const msg = decodeError(err)
      if (!msg) {
        setTxState('idle') // user rejected
        return
      }
      setErrorMsg(msg)
      setTxState('error')
      return
    }

    setTxHash(hash)
    await pollReceipt(hash)
  }

  if (wrongChain) {
    return (
      <div className="flex flex-col gap-4">
        <div className="p-4 rounded-2xl text-sm" style={{ background: 'rgba(232,109,122,0.1)', border: '1px solid rgba(232,109,122,0.3)', color: 'var(--danger)' }}>
          Switch to {ACTIVE_NETWORK.name} before distributing.
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold w-fit"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          <ArrowLeft className="size-4" /> Back
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
        Distribute USDC
      </h2>

      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <Row label="Split" value={trimmedName} />
        <Row label="Total" value={`${formatUsdcAmount(total ?? 0n, 2)} USDC`} accent />
        <Row label="Recipients" value={String(rows.length)} />
      </div>

      {/* Status cards */}
      {txState === 'simulating' && (
        <StatusCard icon={<Loader2 className="size-4 animate-spin" />} color="var(--muted)" msg="Simulating transaction…" />
      )}
      {txState === 'pending' && (
        <StatusCard icon={<Loader2 className="size-4 animate-spin" />} color="var(--accent)" msg="Waiting for wallet confirmation…" />
      )}
      {txState === 'confirming' && (
        <div className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
            <Loader2 className="size-4 animate-spin" style={{ color: 'var(--accent)' }} />
            Confirming on {ACTIVE_NETWORK.name}…
          </div>
          {txHash && (
            <a href={buildExplorerTx(txHash)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--accent)' }}>
              View transaction <ExternalLink className="size-3" />
            </a>
          )}
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Submitted — waiting up to 2 minutes for confirmation. Do not close this window.
          </p>
        </div>
      )}
      {txState === 'unconfirmed' && txHash && (
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(245,200,66,0.1)', border: '1px solid rgba(245,200,66,0.3)' }}>
          <div className="text-sm font-medium" style={{ color: 'var(--warning)' }}>
            Submitted — not yet confirmed
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            The transaction was submitted but confirmation timed out. It may still confirm.
          </p>
          <a href={buildExplorerTx(txHash)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--accent)' }}>
            View on explorer <ExternalLink className="size-3" />
          </a>
          <button
            onClick={() => { void pollReceipt(txHash) }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold w-fit"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}
          >
            <RefreshCw className="size-3" /> Check again
          </button>
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
            <a href={buildExplorerTx(txHash)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--accent)' }}>
              View on {ACTIVE_NETWORK.name} explorer <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
      {txState === 'error' && errorMsg && (
        <div className="flex items-start gap-2 p-3 rounded-2xl text-sm"
          style={{ background: 'rgba(232,109,122,0.1)', border: '1px solid rgba(232,109,122,0.3)', color: 'var(--danger)' }}>
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span>{errorMsg}</span>
            {txHash && (
              <a href={buildExplorerTx(txHash)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs hover:underline" style={{ color: 'var(--accent)' }}>
                View on explorer <ExternalLink className="size-3" />
              </a>
            )}
          </div>
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
        {txState !== 'unconfirmed' && (
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
        )}
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
    <div className="flex items-center gap-2 p-3 rounded-2xl text-sm"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color }}>
      {icon} {msg}
    </div>
  )
}
