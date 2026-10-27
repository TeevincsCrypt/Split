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

  // After approval receipt: refetch both allowance and balance, then advance
  useEffect(() => {
    if (!isSuccess && !isReceiptError) return
    void refetchAllowance()
    void refetchBalance()
  }, [isSuccess, isReceiptError, refetchAllowance, refetchBalance])

  // Auto-advance only once allowance is freshly confirmed >= total
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

  // Receipt reverted
  const receiptReverted = isReceiptError || (receipt?.status === 'reverted')

  return (
    <div className="flex flex-col gap-5">
      <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
        Approve USDC
      </h2>

      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <Row label="Your USDC balance" value={balance !== undefined ? `${formatUsdcAmount(balance, 2)} USDC` : '—'} />
        <Row label="Amount needed" value={total ? `${formatUsdcAmount(total, 2)} USDC` : '—'} accent />
        <Row label="Current allowance" value={allowance !== undefined ? `${formatUsdcAmount(allowance, 2)} USDC` : '—'} />
        <Row label="Sufficient?" value={sufficient ? 'Yes' : 'No'} success={sufficient} />
      </div>

      {/* Approval tx hash while confirming */}
      {approveTxHash && (isConfirming || isSuccess) && (
        <div className="rounded-xl p-3 flex flex-col gap-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
            {isConfirming ? 'Confirming approval…' : 'Approval confirmed'}
          </span>
          <a
            href={buildExplorerTx(approveTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            View approval tx <ExternalLink className="size-3" />
          </a>
        </div>
      )}

      {receiptReverted && approveTxHash && (
        <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(232,109,122,0.1)', border: '1px solid rgba(232,109,122,0.3)', color: 'var(--danger)' }}>
          Approval transaction was reverted.{' '}
          <a href={buildExplorerTx(approveTxHash)} target="_blank" rel="noopener noreferrer"
            className="underline" style={{ color: 'var(--accent)' }}>
            View on explorer.
          </a>
        </div>
      )}

      {!hasBalance && balance !== undefined && (
        <div className="rounded-2xl p-3 text-sm"
          style={{ background: 'rgba(232,109,122,0.12)', border: '1px solid rgba(232,109,122,0.3)', color: 'var(--danger)' }}>
          Insufficient USDC balance. You need {formatUsdcAmount(total ?? 0n, 2)} USDC but only have {formatUsdcAmount(balance, 2)} USDC.
        </div>
      )}

      {!sufficient && !receiptReverted && (
        <div className="rounded-2xl p-3 text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
          Approve the Split contract to spend exactly{' '}
          <strong style={{ color: 'var(--ink)' }}>{formatUsdcAmount(total ?? 0n, 2)} USDC</strong>{' '}
          on your behalf. Exact amount — not unlimited.
        </div>
      )}

      {sufficient && (
        <div className="flex items-center gap-2 p-3 rounded-2xl"
          style={{ background: 'rgba(141,216,159,0.12)', border: '1px solid rgba(141,216,159,0.3)' }}>
          <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>
            Allowance sufficient — continuing…
          </span>
        </div>
      )}

      {userRejected && (
        <div className="text-sm" style={{ color: 'var(--muted)' }}>Approval cancelled — try again when ready.</div>
      )}

      {!userRejected && writeError && !isPending && !receiptReverted && (
        <div className="text-sm" style={{ color: 'var(--danger)' }}>
          {writeError.message.slice(0, 120)}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        {!sufficient && (
          <button
            onClick={handleApprove}
            disabled={isPending || isConfirming || !hasBalance}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all hover:scale-[1.01] disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)', color: '#0d1b2f' }}
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

function Row({ label, value, accent, success }: { label: string; value: string; accent?: boolean; success?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className="font-semibold tabular-nums"
        style={{ color: success ? 'var(--success)' : accent ? 'var(--accent)' : 'var(--ink-2)' }}>
        {value}
      </span>
    </div>
  )
}
