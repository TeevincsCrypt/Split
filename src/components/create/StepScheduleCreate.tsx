/**
 * Step: call createSchedule on the ScheduledSplit contract.
 * Mirrors StepDistribute in structure and error handling.
 *
 * Fixes applied:
 * - simulate (eth_call) before writeContract to surface revert reasons cleanly
 * - parseEventLogs to decode ScheduleCreated (no topics heuristic)
 * - chain: activeArcChain (not null) so viem enforces chain-mismatch guard
 * - validateFirstPayment check right before signing
 * - decoded custom-error messages for every ScheduledSplit error + ERC20 errors
 */
import { useState } from 'react'
import { ArrowLeft, Loader2, ExternalLink, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { getAddress, BaseError, ContractFunctionRevertedError, parseEventLogs } from 'viem'
import { type SplitDraft } from '@/pages/CreateSplit'
import { ACTIVE_NETWORK } from '@/config/networks'
import { activeArcChain } from '@/config'
import { computeAmounts, formatUsdcAmount } from '@/lib/allocation'
import { formatAddress, buildExplorerTx } from '@/lib/utils'
import { SCHEDULED_SPLIT_ABI } from '@/abi/ScheduledSplit'
import type { ScheduleFormState } from './ScheduleForm'
import { validateFirstPayment } from './ScheduleForm'
import { computeDueTimes, formatDueTime } from '@/lib/schedule'
import WrongNetworkBanner from '@/components/WrongNetworkBanner'

interface Props {
  draft: SplitDraft
  scheduleForm: ScheduleFormState
  onBack: () => void
  onCreated: (scheduleId: bigint) => void
}

type StepState =
  | 'idle'
  | 'simulating'
  | 'signing'
  | 'confirming'
  | 'unconfirmed'
  | 'success'
  | 'error'

// ---------------------------------------------------------------------------
// Custom-error messages for every ScheduledSplit + ERC-20 revert name
// ---------------------------------------------------------------------------
const ERROR_MESSAGES: Record<string, string> = {
  InvalidUsdcAddress:        'Invalid USDC address (contract config error).',
  LengthMismatch:            'Recipients and percentages do not match.',
  NoRecipients:              'No recipients specified.',
  TooManyRecipients:         'Too many recipients (max 50).',
  InvalidName:               'Name must be 1–64 characters.',
  InvalidRecipient:          'One or more recipient addresses are invalid.',
  DuplicateRecipient:        'Duplicate recipient address.',
  ZeroAllocation:            'One or more recipients have zero allocation.',
  InvalidAllocationTotal:    'Percentages must sum to exactly 100%.',
  AllocationRoundsToZero:    'Amount per payment is too small for this split.',
  ZeroAmountPerPayment:      'Amount per payment must be greater than zero.',
  InvalidDueTimes:           'Payment dates are invalid (must be in the future, max 24, strictly increasing).',
  DepositMismatch:           'Deposit amount mismatch — try again.',
  ERC20InsufficientAllowance: 'Insufficient USDC allowance. Please go back and approve again.',
  ERC20InsufficientBalance:   'Insufficient USDC balance.',
}

export function decodeScheduleError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError)
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? ''
      if (name === 'TooManyRecipients' && revert.data?.args) {
        return `Too many recipients (${String(revert.data.args[0])}, max 50).`
      }
      if (name === 'InvalidAllocationTotal' && revert.data?.args) {
        return `Percentages sum to ${String(revert.data.args[0])}, not 10000.`
      }
      if (name && ERROR_MESSAGES[name]) return ERROR_MESSAGES[name]
      if (name) return `Contract error: ${name}`
    }
    const msg = err.shortMessage || err.message
    return msg.length > 200 ? msg.slice(0, 200) + '…' : msg
  }
  return String(err).slice(0, 200)
}

/** Wall-clock read for event handlers (kept out of render). */
const nowMs = () => Date.now()

export default function StepScheduleCreate({ draft, scheduleForm, onBack, onCreated }: Props) {
  const { address, chainId: walletChainId } = useAccount()
  const [stepState, setStepState] = useState<StepState>('idle')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [scheduleId, setScheduleId] = useState<bigint | null>(null)

  const publicClient = usePublicClient({ chainId: ACTIVE_NETWORK.chainId })
  const { data: walletClient } = useWalletClient({ chainId: ACTIVE_NETWORK.chainId })

  const wrongChain = !!walletChainId && walletChainId !== ACTIVE_NETWORK.chainId
  const contractAddress = ACTIVE_NETWORK.scheduledSplitAddress!
  const { totalAmountParsed: perPayment, rows, name } = draft

  const bpsValues = rows.map((r) => r.bps)
  const amounts = perPayment ? computeAmounts(perPayment, bpsValues) : []
  const recipients = rows.map((r) => getAddress(r.address))

  const computed = perPayment ? computeDueTimes(scheduleForm) : null
  const totalDeposit = perPayment && computed
    ? perPayment * BigInt(computed.dueTimes.length)
    : null

  function decodeReceiptRevert(receipt: { logs: readonly { address: `0x${string}`; topics: readonly `0x${string}`[]; data: `0x${string}` }[] }, txLink: string): string {
    // Try to pull a revert reason from the receipt logs (rare; most reverts return no data)
    // Fall back to an explorer link so the user can inspect the tx themselves
    void receipt
    return `Transaction reverted. ${txLink ? 'Check the explorer for the revert reason.' : ''}`
  }

  async function handleCreate() {
    if (!perPayment || !computed || !walletClient || !publicClient || !address) return
    if (wrongChain) return

    // Check first-payment lead time right before signing
    const leadErr = validateFirstPayment(scheduleForm.firstDatetime, nowMs())
    if (leadErr) {
      setError(leadErr)
      setStepState('error')
      return
    }

    setStepState('simulating')
    setError('')
    setTxHash(null)

    const callArgs = {
      address: contractAddress,
      abi: SCHEDULED_SPLIT_ABI,
      functionName: 'createSchedule' as const,
      args: [
        name.trim(),
        recipients,
        bpsValues as unknown as readonly number[],
        perPayment,
        computed.dueTimes,
      ] as const,
    }

    // --- Simulate first (surfaces revert reasons without spending gas) ---
    try {
      await publicClient.simulateContract({ ...callArgs, account: address })
    } catch (err) {
      setError(decodeScheduleError(err))
      setStepState('error')
      return
    }

    // --- Send ---
    setStepState('signing')
    let hash: `0x${string}`
    try {
      hash = await walletClient.writeContract({
        ...callArgs,
        account: address,
        chain: activeArcChain,
      })
    } catch (err) {
      setError(decodeScheduleError(err))
      setStepState('error')
      return
    }

    setTxHash(hash)
    setStepState('confirming')

    // --- Wait for receipt ---
    let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
    } catch {
      setStepState('unconfirmed')
      return
    }

    if (receipt.status === 'reverted') {
      setError(decodeReceiptRevert(receipt, buildExplorerTx(hash)))
      setStepState('error')
      return
    }

    // --- Decode ScheduleCreated via parseEventLogs (not topics heuristic) ---
    const matchingLogs = parseEventLogs({
      abi: SCHEDULED_SPLIT_ABI,
      eventName: 'ScheduleCreated',
      logs: receipt.logs,
    }).filter((l) => l.address.toLowerCase() === contractAddress.toLowerCase())

    const foundId = matchingLogs[0]?.args?.id ?? null

    if (foundId == null) {
      setError('Transaction succeeded but no ScheduleCreated event found. Check the explorer.')
      setStepState('error')
      return
    }

    setScheduleId(foundId)
    setStepState('success')
    setTimeout(() => onCreated(foundId), 1500)
  }

  async function handleCheckAgain() {
    if (!txHash || !publicClient) return
    setStepState('confirming')
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 })
      if (receipt.status === 'reverted') {
        setError(decodeReceiptRevert(receipt, buildExplorerTx(txHash)))
        setStepState('error')
        return
      }
      const matchingLogs = parseEventLogs({
        abi: SCHEDULED_SPLIT_ABI,
        eventName: 'ScheduleCreated',
        logs: receipt.logs,
      }).filter((l) => l.address.toLowerCase() === contractAddress.toLowerCase())

      const foundId = matchingLogs[0]?.args?.id ?? null
      if (foundId == null) {
        setError('Transaction confirmed but no ScheduleCreated event found.')
        setStepState('error')
        return
      }
      setScheduleId(foundId)
      setStepState('success')
      setTimeout(() => onCreated(foundId), 1500)
    } catch {
      setStepState('unconfirmed')
    }
  }

  return (
    <div className="card p-5 flex flex-col gap-5">
      {wrongChain && <WrongNetworkBanner />}

      <div className="flex items-center gap-3">
        {(stepState === 'idle' || stepState === 'error') ? (
          <button onClick={onBack} className="icon-btn" aria-label="Back">
            <ArrowLeft className="size-4" />
          </button>
        ) : null}
        <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Create schedule
        </h2>
      </div>

      {/* Summary */}
      <div className="rounded-2xl p-4 flex flex-col gap-2"
        style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}>
        <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
          {name.trim()}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold display tabular-nums" style={{ color: 'var(--ink)' }}>
            {totalDeposit ? formatUsdcAmount(totalDeposit) : '—'}
          </span>
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>USDC</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {computed
            ? `${computed.dueTimes.length} payment${computed.dueTimes.length !== 1 ? 's' : ''} starting ${formatDueTime(computed.dueTimes[0])}`
            : ''}
        </span>
      </div>

      {/* Recipients */}
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between items-center py-1.5 border-b last:border-b-0 text-xs"
            style={{ borderColor: 'var(--border)' }}>
            <span style={{ color: 'var(--ink)' }}>{r.label || formatAddress(r.address)}</span>
            <span className="font-mono tabular-nums" style={{ color: 'var(--muted)' }}>
              {amounts[i] !== undefined ? `${formatUsdcAmount(amounts[i])} USDC` : '—'} ({(r.bps / 100).toFixed(2)}%)
            </span>
          </div>
        ))}
      </div>

      {/* Tx hash */}
      {txHash && (
        <a href={buildExplorerTx(txHash)} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
          <ExternalLink className="size-3" />View transaction
        </a>
      )}

      {/* States */}
      {stepState === 'success' && scheduleId !== null && (
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
          <CheckCircle2 className="size-5" />Schedule #{scheduleId.toString()} created — redirecting…
        </div>
      )}

      {stepState === 'unconfirmed' && txHash && (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2 text-xs p-3 rounded-xl"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
            Submitted but not yet confirmed. Check the explorer or retry.
          </div>
          <button onClick={() => void handleCheckAgain()}
            className="flex items-center gap-2 text-sm font-semibold self-start px-4 py-2 rounded-full"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}>
            <RefreshCw className="size-4" />Check again
          </button>
        </div>
      )}

      {stepState === 'error' && error && (
        <div className="flex items-start gap-2 text-xs p-3 rounded-xl"
          style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          {error}
          {txHash && (
            <a href={buildExplorerTx(txHash)} target="_blank" rel="noopener noreferrer"
              className="ml-auto shrink-0 underline" style={{ color: 'var(--danger)' }}>
              Explorer
            </a>
          )}
        </div>
      )}

      {(stepState === 'idle' || stepState === 'error') && (
        <button
          onClick={() => void handleCreate()}
          disabled={!perPayment || !computed || !walletClient || wrongChain}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {wrongChain ? `Switch to ${ACTIVE_NETWORK.name}` : 'Create schedule'}
        </button>
      )}

      {(stepState === 'simulating' || stepState === 'signing' || stepState === 'confirming') && (
        <button disabled className="btn-primary flex items-center justify-center gap-2 opacity-70 cursor-not-allowed">
          <Loader2 className="size-4 animate-spin" />
          {stepState === 'simulating'  ? 'Checking…'
            : stepState === 'signing' ? 'Confirm in wallet…'
            : 'Confirming transaction…'}
        </button>
      )}
    </div>
  )
}
