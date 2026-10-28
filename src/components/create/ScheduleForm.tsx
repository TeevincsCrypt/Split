/**
 * Date/time/repeat picker for the Schedule flow.
 * Renders the full list of computed payment dates and the total deposit.
 * No contract interaction here — just form state + date math.
 */
import { useMemo, useState } from 'react'
import { AlertCircle, Calendar, Info } from 'lucide-react'
import {
  computeDueTimes, localTimezone, parseDatetimeLocal,
  type RepeatMode, type ComputedDueTimes,
} from '@/lib/schedule'
import { formatUsdcAmount } from '@/lib/allocation'

export interface ScheduleFormState {
  firstDatetime: string
  repeat: RepeatMode
  count: number
}

interface Props {
  totalAmountParsed: bigint | null
  value: ScheduleFormState
  onChange: (v: ScheduleFormState) => void
}

const REPEAT_OPTIONS: { value: RepeatMode; label: string }[] = [
  { value: 'none',     label: 'One-off (no repeat)' },
  { value: 'weekly',   label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly',  label: 'Every month (same day)' },
]

/** Minimum datetime-local string: now + 2 minutes */
function minDatetimeLocal(): string {
  const d = new Date(Date.now() + 2 * 60 * 1000)
  return d.toISOString().slice(0, 16)
}

export default function ScheduleForm({ totalAmountParsed, value, onChange }: Props) {
  const { firstDatetime, repeat, count } = value
  const tz = localTimezone()

  const computed: ComputedDueTimes | null = useMemo(() => {
    if (!firstDatetime) return null
    return computeDueTimes({ firstDatetime, repeat, count })
  }, [firstDatetime, repeat, count])

  // Validate: first payment must be in the future (contract requires dueTimes[0] > block.timestamp)
  const [mountTime] = useState(() => Date.now())
  const firstDate = parseDatetimeLocal(firstDatetime)
  const firstInFuture = firstDate ? firstDate.getTime() > mountTime : false
  const firstError = firstDatetime && !firstInFuture
    ? 'First payment must be in the future.'
    : null

  const perPayment = totalAmountParsed
  const totalDeposit = perPayment && computed ? perPayment * BigInt(computed.dueTimes.length) : null

  const maxCount = repeat === 'none' ? 1 : 24

  return (
    <div className="flex flex-col gap-4">
      {/* Timezone notice */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
        style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
      >
        <Info className="size-3.5 shrink-0" />
        <span>Times are in your local timezone: <strong>{tz}</strong></span>
      </div>

      {/* First payment date */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
          First payment date &amp; time
        </label>
        <input
          type="datetime-local"
          className="input-field font-mono text-sm"
          min={minDatetimeLocal()}
          value={firstDatetime}
          onChange={(e) => onChange({ ...value, firstDatetime: e.target.value })}
        />
        {firstError && (
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--danger)' }}>
            <AlertCircle className="size-3" />{firstError}
          </span>
        )}
      </div>

      {/* Repeat */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Repeat</label>
        <select
          className="input-field text-sm"
          value={repeat}
          onChange={(e) => {
            const r = e.target.value as RepeatMode
            onChange({ ...value, repeat: r, count: r === 'none' ? 1 : count })
          }}
        >
          {REPEAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Number of payments */}
      {repeat !== 'none' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            Number of payments <span style={{ color: 'var(--subtle)' }}>(1–24)</span>
          </label>
          <input
            type="number"
            className="input-field font-mono text-sm"
            min={1}
            max={maxCount}
            value={count}
            onChange={(e) => {
              const n = Math.max(1, Math.min(24, parseInt(e.target.value, 10) || 1))
              onChange({ ...value, count: n })
            }}
          />
        </div>
      )}

      {/* Payment dates list */}
      {computed && !firstError && (
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="size-4" style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
              Payment schedule ({computed.dueTimes.length} payment{computed.dueTimes.length !== 1 ? 's' : ''})
            </span>
          </div>
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
            {computed.labels.map((label, i) => (
              <div key={i} className="flex items-start justify-between gap-2 py-1.5 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{label}</span>
                  <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>{computed.utcLabels[i]}</span>
                </div>
                {perPayment != null && perPayment > 0n && (
                  <span className="font-mono text-xs font-bold tabular-nums shrink-0" style={{ color: 'var(--accent)' }}>
                    {formatUsdcAmount(perPayment)} USDC
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="pt-1 flex flex-col gap-1.5 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--muted)' }}>Amount per payment</span>
              <span className="font-mono font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                {perPayment ? `${formatUsdcAmount(perPayment)} USDC` : '—'}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span style={{ color: 'var(--muted)' }}>Total deposit</span>
              <span className="font-mono font-bold tabular-nums text-sm" style={{ color: 'var(--accent)' }}>
                {totalDeposit ? `${formatUsdcAmount(totalDeposit)} USDC` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Locking notice */}
      <div
        className="flex items-start gap-2 px-3 py-3 rounded-xl text-xs leading-relaxed"
        style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
      >
        <Info className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--subtle)' }} />
        <span>
          The total deposit ({totalDeposit ? `${formatUsdcAmount(totalDeposit)} USDC` : 'total amount'}) will be locked
          in the contract until paid or cancelled. Payments run at or shortly after the scheduled time — never before.
          Cancelling returns all unpaid amounts to you immediately.
        </span>
      </div>
    </div>
  )
}
