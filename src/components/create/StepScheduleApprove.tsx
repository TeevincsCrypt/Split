/**
 * Step: Approve exactly totalDeposit USDC to ScheduledSplit contract.
 * Structure mirrors StepApprove.tsx but targets ScheduledSplit.
 */
import { useEffect } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, ExternalLink, RefreshCw } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { type SplitDraft } from '@/pages/CreateSplit'
import { ACTIVE_NETWORK } from '@/config/networks'
import { formatUsdcAmount } from '@/lib/allocation'
import { buildExplorerTx } from '@/lib/utils'
import type { ScheduleFormState } from './ScheduleForm'
import { computeDueTimes } from '@/lib/schedule'

interface Props {
  draft: SplitDraft
  scheduleForm: ScheduleFormState
  onBack: () => void
  onNext: () => void
}

export default function StepScheduleApprove({ draft, scheduleForm, onBack, onNext }: Props) {
  const { address } = useAccount()
  const contractAddress = ACTIVE_NETWORK.scheduledSplitAddress!
  const { totalAmountParsed: perPayment } = draft

  const computed = perPayment
    ? computeDueTimes({ ...scheduleForm })
    : null
  const totalDeposit = perPayment && computed
    ? perPayment * BigInt(computed.dueTimes.length)
    : null

  const {
    data: allowance,
    refetch: refetchAllowance,
    isLoading: allowanceLoading,
    isError: allowanceError,
  } = useReadContract({
    address: ACTIVE_NETWORK.usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address as `0x${string}`, contractAddress],
    chainId: ACTIVE_NETWORK.chainId,
    query: { enabled: !!address },
  })

  const {
    data: balance,
    isLoading: balanceLoading,
    isError: balanceError,
    refetch: refetchBalance,
  } = useReadContract({
    address: ACTIVE_NETWORK.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    chainId: ACTIVE_NETWORK.chainId,
    query: { enabled: !!address },
  })

  const { writeContract, data: approveTxHash, isPending: approvePending, error: approveError } = useWriteContract()

  const {
    data: approveReceipt,
    isLoading: approveConfirming,
  } = useWaitForTransactionReceipt({
    hash: approveTxHash,
    timeout: 120_000,
  })

  // After confirmed, refetch both
  useEffect(() => {
    if (!approveReceipt) return
    void Promise.all([refetchAllowance(), refetchBalance()])
  }, [approveReceipt, refetchAllowance, refetchBalance])

  // Auto-advance when fresh allowance >= totalDeposit
  useEffect(() => {
    if (!totalDeposit || !allowance) return
    if (approveConfirming) return
    if ((allowance) >= totalDeposit) onNext()
  }, [allowance, totalDeposit, approveConfirming, onNext])

  const alreadyApproved = totalDeposit && allowance ? (allowance) >= totalDeposit : false
  const insufficientBalance = totalDeposit && balance ? (balance) < totalDeposit : false

  function handleApprove() {
    if (!totalDeposit) return
    writeContract({
      address: ACTIVE_NETWORK.usdcAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [contractAddress, totalDeposit],
      chainId: ACTIVE_NETWORK.chainId,
    })
  }

  const isReverted = approveReceipt?.status === 'reverted'
  const confirming = approveConfirming && !approveReceipt

  return (
    <div className="card p-5 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="icon-btn" aria-label="Back">
          <ArrowLeft className="size-4" />
        </button>
        <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Approve deposit
        </h2>
      </div>

      {/* Total deposit card */}
      <div className="rounded-2xl p-4 flex flex-col items-center gap-1 text-center"
        style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}>
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
          Total deposit
        </span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-3xl font-bold display tabular-nums" style={{ color: 'var(--ink)' }}>
            {totalDeposit ? formatUsdcAmount(totalDeposit) : '—'}
          </span>
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>USDC</span>
        </div>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {computed ? `${computed.dueTimes.length} payment${computed.dueTimes.length !== 1 ? 's' : ''} × ${perPayment ? formatUsdcAmount(perPayment) : '—'} USDC` : ''}
        </span>
      </div>

      {/* Balance */}
      <div className="flex justify-between text-xs px-1">
        <span style={{ color: 'var(--muted)' }}>Your USDC balance</span>
        <span className="font-mono font-bold tabular-nums"
          style={{ color: balanceError ? 'var(--danger)' : insufficientBalance ? 'var(--danger)' : 'var(--ink)' }}>
          {balanceLoading ? '…' : balanceError ? 'Read failed' : balance !== undefined ? `${formatUsdcAmount(balance)} USDC` : '—'}
        </span>
      </div>

      {insufficientBalance && (
        <p className="text-xs px-1" style={{ color: 'var(--danger)' }}>
          Insufficient USDC balance for this deposit.
        </p>
      )}

      {/* Allowance */}
      <div className="flex justify-between text-xs px-1">
        <span style={{ color: 'var(--muted)' }}>Current allowance</span>
        <span className="font-mono font-bold tabular-nums"
          style={{ color: allowanceError ? 'var(--danger)' : 'var(--ink)' }}>
          {allowanceLoading ? '…' : allowanceError ? 'Read failed' : allowance !== undefined ? `${formatUsdcAmount(allowance)} USDC` : '—'}
        </span>
      </div>

      {(allowanceError || balanceError) && (
        <button
          onClick={() => { void Promise.all([refetchAllowance(), refetchBalance()]) }}
          className="flex items-center gap-1.5 text-xs font-semibold self-start px-3 py-1.5 rounded-full"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
        >
          <RefreshCw className="size-3" />Retry reads
        </button>
      )}

      {/* Tx hash while confirming */}
      {approveTxHash && (
        <a
          href={buildExplorerTx(approveTxHash)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'var(--accent)' }}
        >
          <ExternalLink className="size-3" />
          {confirming ? 'Confirming…' : 'View approval tx'}
        </a>
      )}

      {/* Reverted receipt */}
      {isReverted && (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          Approval transaction reverted.{' '}
          <a href={buildExplorerTx(approveTxHash!)} target="_blank" rel="noopener noreferrer"
            className="underline" style={{ color: 'var(--danger)' }}>
            View on explorer
          </a>
        </p>
      )}

      {/* Error */}
      {approveError && !approveTxHash && (
        <p className="text-xs" style={{ color: 'var(--danger)' }}>
          {(approveError as Error).message?.slice(0, 120)}
        </p>
      )}

      {/* Approved indicator */}
      {alreadyApproved && (
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
          <CheckCircle2 className="size-4" />Deposit approved — advancing…
        </div>
      )}

      {/* Approve button */}
      {!alreadyApproved && (
        <button
          onClick={handleApprove}
          disabled={approvePending || confirming || insufficientBalance || !totalDeposit}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {(approvePending || confirming) && <Loader2 className="size-4 animate-spin" />}
          {approvePending ? 'Confirm in wallet…' : confirming ? 'Confirming…' : `Approve ${totalDeposit ? formatUsdcAmount(totalDeposit) : ''} USDC`}
        </button>
      )}

      <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
        This approves the exact deposit amount. The split recipients and amounts are set in the next step.
      </p>
    </div>
  )
}
