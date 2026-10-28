import { useState, useEffect } from 'react'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { usePublicClient } from 'wagmi'
import { type SplitDraft } from '@/pages/CreateSplit'
import { computeAmounts, formatUsdcAmount } from '@/lib/allocation'
import { formatAddress } from '@/lib/utils'
import { ACTIVE_NETWORK } from '@/config/networks'
import { SPLIT_DISTRIBUTOR_ABI } from '@/abi/SplitDistributor'
import { getAddress } from 'viem'
import type { ScheduleFormState } from './ScheduleForm'
import { computeDueTimes } from '@/lib/schedule'

interface Props {
  draft: SplitDraft
  onBack: () => void
  onNext: () => void
  /** When set, shows schedule summary instead of distribute summary */
  scheduleForm?: ScheduleFormState
}

export default function StepReview({ draft, onBack, onNext, scheduleForm }: Props) {
  const [confirmed, setConfirmed] = useState(false)
  const [gasEstimate, setGasEstimate] = useState<bigint | null | 'error'>('error')
  const [estimating, setEstimating] = useState(false)
  const publicClient = usePublicClient({ chainId: ACTIVE_NETWORK.chainId })

  const { totalAmountParsed: total, rows, name } = draft
  const bpsValues = rows.map((r) => r.bps)
  const amounts = total ? computeAmounts(total, bpsValues) : []
  const recipients = rows.map((r) => getAddress(r.address))

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

  const schedComputed = scheduleForm ? computeDueTimes(scheduleForm) : null
  const totalDeposit = total && schedComputed ? total * BigInt(schedComputed.dueTimes.length) : null

  return (
    <div className="flex flex-col gap-4">
      <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
        {scheduleForm ? 'Review schedule' : 'Review distribution'}
      </h2>

      {/* Big total card */}
      <div
        className="card p-5 flex flex-col items-center gap-1 text-center"
        style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}
      >
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>
          {scheduleForm ? 'Total deposit' : 'Total'}
        </span>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>$</span>
          <span className="display font-extrabold text-4xl nums" style={{ color: 'var(--accent)', letterSpacing: '-0.04em' }}>
            {formatUsdcAmount(scheduleForm ? (totalDeposit ?? 0n) : (total ?? 0n), 2)}
          </span>
          <span className="text-base font-bold" style={{ color: 'var(--accent)' }}>USDC</span>
        </div>
        {scheduleForm && schedComputed && (
          <span className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
            {schedComputed.dueTimes.length} payment{schedComputed.dueTimes.length !== 1 ? 's' : ''} × {formatUsdcAmount(total ?? 0n)} USDC each
          </span>
        )}
        <span className="text-xs font-semibold mt-1" style={{ color: 'var(--accent)' }}>
          {rows.length} recipient{rows.length !== 1 ? 's' : ''} · {name}
        </span>
      </div>

      {/* Details card */}
      <div className="card p-4 flex flex-col gap-2">
        <Row label="Network" value={ACTIVE_NETWORK.name} />
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
            className="card px-4 py-3 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="size-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                {row.label && (
                  <div className="text-sm font-semibold truncate" style={{ color: 'var(--ink-2)' }}>{row.label}</div>
                )}
                <div className="text-xs mono truncate" style={{ color: 'var(--subtle)' }}>
                  {formatAddress(row.address)}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold nums" style={{ color: 'var(--accent)' }}>
                {formatUsdcAmount(amounts[i] ?? 0n, 2)} USDC
              </div>
              <div
                className="text-xs nums px-2 py-0.5 rounded-full mt-0.5 inline-block"
                style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
              >
                {(row.bps / 100).toFixed(2)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Irreversibility notice */}
      <div
        className="rounded-2xl p-4 flex items-start gap-3"
        style={{ background: 'var(--warning-bg)', border: '1px solid var(--warning)' }}
      >
        <AlertTriangle className="size-4 mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />
        <p className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
          This transaction is irreversible. Once signed, USDC will be sent directly to each
          recipient. Verify all addresses carefully.
        </p>
      </div>

      {/* Confirm checkbox */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="size-4 rounded"
          style={{ accentColor: 'var(--accent)' }}
        />
        <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
          I have verified all recipient addresses and understand this is irreversible.
        </span>
      </label>

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-ghost flex items-center gap-2">
          <ArrowLeft className="size-4" /> Back
        </button>
        <button
          onClick={onNext}
          disabled={!confirmed}
          className="btn-primary flex-1 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue to approve →
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>{value}</span>
    </div>
  )
}
