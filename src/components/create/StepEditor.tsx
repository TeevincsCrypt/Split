import { useState } from 'react'
import { Plus, Trash2, Shuffle, AlertCircle } from 'lucide-react'
import { type SplitDraft } from '@/pages/CreateSplit'
import { type RecipientRow, validateSplit } from '@/lib/validation'
import {
  computeAmounts, parseUsdcInput, formatUsdcAmount,
  percentToBps, bpsToPercent, sumBps, equalBps, BPS_DENOMINATOR
} from '@/lib/allocation'
import { MAX_RECIPIENTS } from '@/config/networks'

interface Props {
  draft: SplitDraft
  onChange: (d: SplitDraft) => void
  onNext: () => void
}

const EXAMPLE_BPS = [4000, 2500, 2000, 1500]
const EXAMPLE_LABELS = ['Alice', 'Bob', 'Carol', 'Dave']

export default function StepEditor({ draft, onChange, onNext }: Props) {
  const [touched, setTouched] = useState(false)

  const totalParsed = parseUsdcInput(draft.totalAmountRaw)
  const bpsValues = draft.rows.map((r) => r.bps)
  const allocated = sumBps(bpsValues)
  const remaining = Number(BPS_DENOMINATOR) - allocated
  const amounts = totalParsed && totalParsed > 0n ? computeAmounts(totalParsed, bpsValues) : null

  const validation = validateSplit(draft.name, totalParsed, draft.rows)

  function updateRow(i: number, patch: Partial<RecipientRow>) {
    const rows = draft.rows.map((r, idx) => idx === i ? { ...r, ...patch } : r)
    onChange({ ...draft, rows })
  }

  function addRow() {
    if (draft.rows.length >= MAX_RECIPIENTS) return
    onChange({ ...draft, rows: [...draft.rows, { label: '', address: '', bps: 0 }] })
  }

  function removeRow(i: number) {
    onChange({ ...draft, rows: draft.rows.filter((_, idx) => idx !== i) })
  }

  function splitEvenly() {
    const n = draft.rows.length
    if (n === 0) return
    const bps = equalBps(n)
    const rows = draft.rows.map((r, i) => ({ ...r, bps: bps[i] }))
    onChange({ ...draft, rows })
  }

  function fillExample() {
    const rows = EXAMPLE_BPS.map((bps, i) => ({
      label: EXAMPLE_LABELS[i],
      address: '',
      bps,
    }))
    onChange({ ...draft, rows })
  }

  function handlePctChange(i: number, raw: string) {
    const bps = percentToBps(raw)
    updateRow(i, { bps: bps ?? 0 })
  }

  function handleNext() {
    setTouched(true)
    if (validation.valid) onNext()
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
        Create a split
      </h2>

      {/* Name */}
      <Field label="Split name" error={touched ? validation.nameError : null}>
        <input
          type="text"
          maxLength={64}
          placeholder="e.g. Q4 2026 contributors"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className="w-full bg-transparent text-sm outline-none placeholder:opacity-40"
          style={{ color: 'var(--ink)' }}
        />
      </Field>

      {/* Description (UI only) */}
      <Field label="Description (optional — not stored onchain)">
        <input
          type="text"
          placeholder="Private note for your records"
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          className="w-full bg-transparent text-sm outline-none placeholder:opacity-40"
          style={{ color: 'var(--ink)' }}
        />
      </Field>

      {/* Total amount */}
      <Field label="Total USDC amount" error={touched ? validation.amountError : null}>
        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            type="text"
            placeholder="0.00"
            value={draft.totalAmountRaw}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              onChange({ ...draft, totalAmountRaw: v, totalAmountParsed: parseUsdcInput(v) })
            }}
            className="flex-1 bg-transparent text-sm outline-none tabular-nums placeholder:opacity-40"
            style={{ color: 'var(--ink)' }}
          />
          <span className="text-xs font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>
      </Field>

      {/* Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
            Recipients ({draft.rows.length}/{MAX_RECIPIENTS})
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={fillExample}
              className="text-xs px-2 py-1 rounded-lg"
              style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
            >
              Example: 40/25/20/15
            </button>
            <button
              type="button"
              onClick={splitEvenly}
              className="text-xs px-2 py-1 rounded-lg flex items-center gap-1"
              style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
            >
              <Shuffle className="size-3" /> Even
            </button>
          </div>
        </div>

        {touched && validation.recipientsError && (
          <ErrorMsg msg={validation.recipientsError} />
        )}

        <div className="flex flex-col gap-2">
          {draft.rows.map((row, i) => {
            const amount = amounts?.[i]
            const rowErr = touched ? validation.rowErrors[i] : null
            const roundErr = touched ? validation.roundingErrors[i] : null
            return (
              <div
                key={i}
                className="rounded-2xl p-3 flex flex-col gap-2"
                style={{ background: 'var(--surface)', border: `1px solid ${rowErr || roundErr ? 'var(--danger)' : 'var(--border)'}` }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs tabular-nums w-5 shrink-0" style={{ color: 'var(--subtle)' }}>
                    {i + 1}.
                  </span>
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={row.label}
                    onChange={(e) => updateRow(i, { label: e.target.value })}
                    className="flex-1 bg-transparent text-xs outline-none placeholder:opacity-40"
                    style={{ color: 'var(--muted)' }}
                  />
                  {draft.rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} className="opacity-40 hover:opacity-70 transition-opacity">
                      <Trash2 className="size-3.5" style={{ color: 'var(--danger)' }} />
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="0x wallet address"
                  value={row.address}
                  onChange={(e) => updateRow(i, { address: e.target.value.trim() })}
                  className="w-full bg-transparent text-xs mono outline-none placeholder:opacity-40"
                  style={{ color: 'var(--ink-2)' }}
                />
                <div className="flex items-center gap-2">
                  <input
                    inputMode="decimal"
                    type="text"
                    placeholder="0.00"
                    value={row.bps > 0 ? bpsToPercent(row.bps) : ''}
                    onChange={(e) => handlePctChange(i, e.target.value)}
                    className="w-20 bg-transparent text-sm outline-none tabular-nums placeholder:opacity-40"
                    style={{ color: 'var(--ink)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--subtle)' }}>%</span>
                  {amount !== undefined && amount > 0n && (
                    <span className="ml-auto text-xs tabular-nums font-semibold" style={{ color: 'var(--accent)' }}>
                      {formatUsdcAmount(amount, 2)} USDC
                    </span>
                  )}
                </div>
                {rowErr && <ErrorMsg msg={rowErr} />}
                {roundErr && <ErrorMsg msg={roundErr} />}
              </div>
            )
          })}
        </div>

        {draft.rows.length < MAX_RECIPIENTS && (
          <button
            type="button"
            onClick={addRow}
            className="mt-2 w-full py-2 rounded-xl flex items-center justify-center gap-1 text-sm transition-colors"
            style={{ border: '1px dashed var(--border)', color: 'var(--subtle)' }}
          >
            <Plus className="size-4" /> Add recipient
          </button>
        )}
      </div>

      {/* Live summary */}
      <div
        className="rounded-2xl p-4 flex flex-col gap-2 text-sm"
        style={{ background: 'var(--surface-muted)' }}
      >
        <SummaryRow label="Recipients" value={`${draft.rows.length}`} />
        <SummaryRow
          label="Allocated"
          value={`${(allocated / 100).toFixed(2)}% (${allocated} bps)`}
          accent={allocated === Number(BPS_DENOMINATOR)}
          error={allocated > Number(BPS_DENOMINATOR)}
        />
        {remaining !== 0 && (
          <SummaryRow
            label={remaining > 0 ? 'Remaining' : 'Over by'}
            value={`${Math.abs(remaining / 100).toFixed(2)}%`}
            error={true}
          />
        )}
        {totalParsed !== null && totalParsed > 0n && (
          <SummaryRow label="Total" value={`${formatUsdcAmount(totalParsed, 2)} USDC`} />
        )}
        {touched && validation.allocationError && (
          <ErrorMsg msg={validation.allocationError} />
        )}
      </div>

      <button
        onClick={handleNext}
        className="w-full py-3.5 rounded-2xl text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
        style={{ background: 'var(--accent)', color: '#0d1b2f' }}
      >
        Review distribution
      </button>
    </div>
  )
}

function Field({
  label,
  children,
  error,
}: {
  label: string
  children: React.ReactNode
  error?: string | null
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--subtle)' }}>
        {label}
      </label>
      <div
        className="rounded-xl px-3 py-2.5"
        style={{
          background: 'var(--surface)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
        }}
      >
        {children}
      </div>
      {error && <ErrorMsg msg={error} />}
    </div>
  )
}

function SummaryRow({
  label,
  value,
  accent,
  error,
}: {
  label: string
  value: string
  accent?: boolean
  error?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--subtle)' }}>{label}</span>
      <span
        className="font-semibold tabular-nums"
        style={{ color: error ? 'var(--danger)' : accent ? 'var(--success)' : 'var(--ink-2)' }}
      >
        {value}
      </span>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-1 mt-1">
      <AlertCircle className="size-3 shrink-0" style={{ color: 'var(--danger)' }} />
      <span className="text-xs" style={{ color: 'var(--danger)' }}>{msg}</span>
    </div>
  )
}
