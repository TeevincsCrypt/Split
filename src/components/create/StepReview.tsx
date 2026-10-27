import { useState, useEffect } from 'react'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { usePublicClient } from 'wagmi'
import { type SplitDraft } from '@/pages/CreateSplit'
import { computeAmounts, formatUsdcAmount } from '@/lib/allocation'
import { formatAddress } from '@/lib/utils'
import { ACTIVE_NETWORK } from '@/config/networks'
import { SPLIT_DISTRIBUTOR_ABI } from '@/abi/SplitDistributor'
import { getAddress } from 'viem'

interface Props {
  draft: SplitDraft
  onBack: () => void
  onNext: () => void
}

export default function StepReview({ draft, onBack, onNext }: Props) {
  const [confirmed, setConfirmed] = useState(false)
  const [gasEstimate, setGasEstimate] = useState<bigint | null | 'error'>('error')
  const [estimating, setEstimating] = useState(false)
  const publicClient = usePublicClient()

  const { totalAmountParsed: total, rows, name } = draft
  const bpsValues = rows.map((r) => r.bps)
  const amounts = total ? computeAmounts(total, bpsValues) : []
  const recipients = rows.map((r) => getAddress(r.address))

  // Estimate gas on mount
  useEffect(() => {
    if (!publicClient || !total || !ACTIVE_NETWORK.distributorAddress) return
    let active = true
    setEstimating(true)
    publicClient.estimateContractGas({
      address: ACTIVE_NETWORK.distributorAddress,
      abi: SPLIT_DISTRIBUTOR_ABI,
      functionName: 'distribute',
      args: [name, total, recipients, bpsValues.map((b) => b as unknown as never)],
    }).then((gas) => {
      if (active) setGasEstimate(gas)
    }).catch(() => {
      if (active) setGasEstimate('error')
    }).finally(() => {
      if (active) setEstimating(false)
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
        Review distribution
      </h2>

      {/* Header info */}
      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <Row label="Split name" value={name} />
        <Row label="Network" value={ACTIVE_NETWORK.name} />
        <Row label="Total" value={`${formatUsdcAmount(total ?? 0n, 2)} USDC`} accent />
        <Row label="Recipients" value={String(rows.length)} />
        <Row
          label="Gas estimate"
          value={estimating ? 'Estimating…' : gasEstimate === 'error' ? 'Unavailable' : `~${gasEstimate} gas`}
        />
      </div>

      {/* Recipient rows */}
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-3 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="min-w-0">
              {row.label && (
                <div className="text-sm font-medium truncate" style={{ color: 'var(--ink-2)' }}>
                  {row.label}
                </div>
              )}
              <div className="text-xs mono truncate" style={{ color: 'var(--subtle)' }}>
                {formatAddress(row.address)}
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <div className="text-sm font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                {formatUsdcAmount(amounts[i] ?? 0n, 2)} USDC
              </div>
              <div className="text-xs tabular-nums" style={{ color: 'var(--subtle)' }}>
                {(row.bps / 100).toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Irreversibility notice */}
      <div
        className="rounded-2xl p-4 flex items-start gap-3"
        style={{ background: 'rgba(245,200,66,0.1)', border: '1px solid rgba(245,200,66,0.3)' }}
      >
        <AlertTriangle className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
        <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
          This transaction is irreversible. Once signed, USDC will be sent directly to each
          recipient. Verify all addresses carefully before proceeding.
        </p>
      </div>

      {/* Confirm checkbox */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="size-4 rounded accent-teal-400"
        />
        <span className="text-sm" style={{ color: 'var(--muted)' }}>
          I have verified all recipient addresses and understand this transaction is irreversible.
        </span>
      </label>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
        >
          <ArrowLeft className="size-4" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={!confirmed}
          className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#0d1b2f' }}
        >
          Continue to approve
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className="font-semibold tabular-nums" style={{ color: accent ? 'var(--accent)' : 'var(--ink-2)' }}>
        {value}
      </span>
    </div>
  )
}
