import { useEffect } from 'react'
import { ArrowLeft, CheckCircle2, Loader2, ExternalLink } from 'lucide-react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { type SplitDraft } from '@/pages/CreateSplit'
import { ACTIVE_NETWORK } from '@/config/networks'
import { formatUsdcAmount } from '@/lib/allocation'
import { buildExplorerTx } from '@/lib/utils'

interface Props {
  draft: SplitDraft
  onBack: () => void
  onNext: () => void
}

export default function StepApprove({ draft, onBack, onNext }: Props) {
  const { address } = useAccount()
  const { totalAmountParsed: total } = draft
  const contractAddress = ACTIVE_NETWORK.distributorAddress!

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: ACTIVE_NETWORK.usdcAddress,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [address as `0x${string}`, contractAddress],
    chainId: ACTIVE_NETWORK.chainId,
  })

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: ACTIVE_NETWORK.usdcAddress,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    chainId: ACTIVE_NETWORK.chainId,
  })

  const sufficient = allowance !== undefined && total !== null && allowance >= total
  const hasBalance = balance !== undefined && total !== null && balance >= total

  const { writeContract, data: approveTxHash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, isError: isReceiptError, data: receipt } =
    useWaitForTransactionReceipt({ hash: approveTxHash })

  useEffect(() => {
    if (!isSuccess && !isReceiptError) return
    void refetchAllowance()
    void refetchBalance()
  }, [isSuccess, isReceiptError, refetchAllowance, refetchBalance])

  useEffect(() => {
    if (sufficient && !isConfirming) {
      const t = setTimeout(() => onNext(), 800)
      return () => clearTimeout(t)
    }
  }, [sufficient, isConfirming, onNext])

  function handleApprove() {
    if (!total) return
    writeContract({
      address: ACTIVE_NETWORK.usdcAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [contractAddress, total],
      chainId: ACTIVE_NETWORK.chainId,
    })
  }

  const userRejected = writeError?.message?.toLowerCase().includes('user rejected') ||
    writeError?.message?.toLowerCase().includes('denied')
  const receiptReverted = isReceiptError || (receipt?.status === 'reverted')

  return (
    <div className="flex flex-col gap-4">
      <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
        Approve USDC
      </h2>

      {/* Amount card */}
      <div
        className="card p-5 flex flex-col items-center gap-1 text-center"
        style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}
      >
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Amount to approve</span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>$</span>
          <span className="display font-extrabold text-4xl nums" style={{ color: 'var(--accent)', letterSpacing: '-0.04em' }}>
            {formatUsdcAmount(total ?? 0n, 2)}
          </span>
          <span className="text-base font-bold" style={{ color: 'var(--accent)' }}>USDC</span>
        </div>
        <span className="text-xs font-semibold mt-1" style={{ color: 'var(--accent)' }}>Exact amount — not unlimited</span>
      </div>

      {/* Balance / allowance card */}
      <div className="card p-4 flex flex-col gap-2">
        <Row label="Your balance" value={balance !== undefined ? `${formatUsdcAmount(balance, 2)} USDC` : '—'} />
        <Row label="Current allowance" value={allowance !== undefined ? `${formatUsdcAmount(allowance, 2)} USDC` : '—'} />
        <Row label="Sufficient?" value={sufficient ? 'Yes' : 'No'} success={sufficient} />
      </div>

      {/* Approval tx hash while confirming */}
      {approveTxHash && (isConfirming || isSuccess) && (
        <div className="card p-3.5 flex flex-col gap-1.5">
          <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            {isConfirming ? 'Confirming approval…' : 'Approval confirmed'}
          </span>
          <a
            href={buildExplorerTx(approveTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            View approval tx <ExternalLink className="size-3" />
          </a>
        </div>
      )}

      {receiptReverted && approveTxHash && (
        <div className="rounded-2xl p-3.5 text-sm font-medium"
          style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          Approval transaction was reverted.{' '}
          <a href={buildExplorerTx(approveTxHash)} target="_blank" rel="noopener noreferrer"
            className="underline font-semibold">View on explorer.</a>
        </div>
      )}

      {!hasBalance && balance !== undefined && (
        <div className="rounded-2xl p-3.5 text-sm font-medium"
          style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          Insufficient USDC balance. Need {formatUsdcAmount(total ?? 0n, 2)} USDC, have {formatUsdcAmount(balance, 2)} USDC.
        </div>
      )}

      {!sufficient && !receiptReverted && (
        <div className="card p-3.5 text-sm" style={{ color: 'var(--muted)' }}>
          Approve the Split contract to spend exactly{' '}
          <strong style={{ color: 'var(--ink)' }}>{formatUsdcAmount(total ?? 0n, 2)} USDC</strong>.
        </div>
      )}

      {sufficient && (
        <div className="flex items-center gap-2 p-3.5 rounded-2xl"
          style={{ background: 'var(--success-bg)', border: '1px solid var(--success)' }}>
          <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
          <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
            Allowance sufficient — continuing…
          </span>
        </div>
      )}

      {userRejected && (
        <div className="text-sm font-medium text-center" style={{ color: 'var(--muted)' }}>
          Approval cancelled — try again when ready.
        </div>
      )}

      {!userRejected && writeError && !isPending && !receiptReverted && (
        <div className="text-sm font-medium" style={{ color: 'var(--danger)' }}>
          {writeError.message.slice(0, 120)}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-ghost flex items-center gap-2">
          <ArrowLeft className="size-4" /> Back
        </button>
        {!sufficient && (
          <button
            onClick={handleApprove}
            disabled={isPending || isConfirming || !hasBalance}
            className="btn-primary flex-1 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? <><Loader2 className="size-4 animate-spin" /> Confirm in wallet…</> :
              isConfirming ? <><Loader2 className="size-4 animate-spin" /> Confirming…</> :
              receiptReverted ? 'Try again' :
              'Approve USDC'}
          </button>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, success }: { label: string; value: string; success?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="font-semibold nums" style={{ color: success ? 'var(--success)' : 'var(--ink-2)' }}>{value}</span>
    </div>
  )
}
