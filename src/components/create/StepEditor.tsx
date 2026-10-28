import { useRef, useState, useCallback } from 'react'
import { Plus, Trash2, Shuffle, AlertCircle, Users, BookOpen, Save, X, Check } from 'lucide-react'
import { type SplitDraft } from '@/pages/CreateSplit'
import { type RecipientRow, validateSplit } from '@/lib/validation'
import {
  previewAmounts, parseUsdcInput, formatUsdcAmount,
  percentToBps, bpsToPercent, sumBps, equalBps, BPS_DENOMINATOR,
} from '@/lib/allocation'
import { MAX_RECIPIENTS } from '@/config/networks'
import {
  loadBook, saveTeam, validateTeamName,
  type Contact, type Team,
} from '@/lib/addressBook'
import { formatAddress } from '@/lib/utils'

interface Props {
  draft: SplitDraft
  touched: TouchedState
  onTouch: (patch: Partial<TouchedState>) => void
  onChange: (d: SplitDraft) => void
  onNext: () => void
}

/** Which fields have been visited (blurred) by the user. */
export interface TouchedState {
  name: boolean
  amount: boolean
  /** per-row: address, bps, both keyed as rowAddress_i and rowBps_i */
  rowAddress: boolean[]
  rowBps: boolean[]
  /** true after the Review button has been clicked at least once */
  submitted: boolean
}

export function initTouched(nRows: number): TouchedState {
  return {
    name: false,
    amount: false,
    rowAddress: new Array<boolean>(nRows).fill(false),
    rowBps: new Array<boolean>(nRows).fill(false),
    submitted: false,
  }
}

const EXAMPLE_BPS = [4000, 2500, 2000, 1500]
const EXAMPLE_LABELS = ['Alice', 'Bob', 'Carol', 'Dave']

export default function StepEditor({ draft, touched, onTouch, onChange, onNext }: Props) {
  // Refs for focusing first error field
  const nameRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const addressRefs = useRef<(HTMLInputElement | null)[]>([])
  const bpsRefs = useRef<(HTMLInputElement | null)[]>([])

  const totalParsed = parseUsdcInput(draft.totalAmountRaw)
  const bpsValues = draft.rows.map((r) => r.bps)
  const allocated = sumBps(bpsValues)
  const remaining = Number(BPS_DENOMINATOR) - allocated
  const exactlyFull = allocated === Number(BPS_DENOMINATOR)

  // Preview amounts: floor-only when allocation invalid
  const previewList = totalParsed && totalParsed > 0n
    ? previewAmounts(totalParsed, bpsValues)
    : null

  // Unallocated USDC amount (only meaningful when not exactly full)
  const unallocatedUsdc = totalParsed && totalParsed > 0n && !exactlyFull && previewList
    ? totalParsed - (previewList).reduce<bigint>(
        (acc, v) => acc + (v ?? 0n), 0n
      )
    : null

  const validation = validateSplit(draft.name, totalParsed, draft.rows)

  // Determine which errors are currently visible per-field
  const showNameErr = touched.name || touched.submitted
  const showAmtErr = touched.amount || touched.submitted

  function rowAddrTouched(i: number) { return (touched.rowAddress[i] ?? false) || touched.submitted }
  function rowBpsTouched(i: number) { return (touched.rowBps[i] ?? false) || touched.submitted }

  function touchRowAddress(i: number) {
    const ra = [...(touched.rowAddress)]
    ra[i] = true
    onTouch({ rowAddress: ra })
  }
  function touchRowBps(i: number) {
    const rb = [...(touched.rowBps)]
    rb[i] = true
    onTouch({ rowBps: rb })
  }

  function updateRow(i: number, patch: Partial<RecipientRow>) {
    const rows = draft.rows.map((r, idx) => idx === i ? { ...r, ...patch } : r)
    onChange({ ...draft, rows })
    // Grow touched arrays if rows were added
    if (touched.rowAddress.length <= i) {
      onTouch({
        rowAddress: [...touched.rowAddress, ...new Array<boolean>(i + 1 - touched.rowAddress.length).fill(false)],
        rowBps: [...touched.rowBps, ...new Array<boolean>(i + 1 - touched.rowBps.length).fill(false)],
      })
    }
  }

  function addRow() {
    if (draft.rows.length >= MAX_RECIPIENTS) return
    const newIdx = draft.rows.length
    onChange({ ...draft, rows: [...draft.rows, { label: '', address: '', bps: 0 }] })
    onTouch({
      rowAddress: [...touched.rowAddress.slice(0, newIdx), false],
      rowBps: [...touched.rowBps.slice(0, newIdx), false],
    })
  }

  function removeRow(i: number) {
    onChange({ ...draft, rows: draft.rows.filter((_, idx) => idx !== i) })
    onTouch({
      rowAddress: touched.rowAddress.filter((_, idx) => idx !== i),
      rowBps: touched.rowBps.filter((_, idx) => idx !== i),
    })
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

  function focusFirstError() {
    // Focus the first visible invalid field
    if (validation.nameError && nameRef.current) { nameRef.current.focus(); return }
    if (validation.amountError && amountRef.current) { amountRef.current.focus(); return }
    for (let i = 0; i < draft.rows.length; i++) {
      if (validation.rowErrors[i] && addressRefs.current[i]) {
        addressRefs.current[i]!.focus(); return
      }
      if (validation.roundingErrors[i] && bpsRefs.current[i]) {
        bpsRefs.current[i]!.focus(); return
      }
    }
    // allocation error — focus the first bps field
    if (validation.allocationError && bpsRefs.current[0]) {
      bpsRefs.current[0].focus()
    }
  }

  function handleNext() {
    onTouch({
      name: true,
      amount: true,
      rowAddress: draft.rows.map(() => true),
      rowBps: draft.rows.map(() => true),
      submitted: true,
    })
    if (validation.valid) {
      onNext()
    } else {
      focusFirstError()
    }
  }

  const errorCount = [
    validation.nameError,
    validation.amountError,
    validation.recipientsError,
    ...validation.rowErrors,
    validation.allocationError,
    ...validation.roundingErrors,
  ].filter(Boolean).length

  const disableReason = !validation.valid
    ? errorCount === 1 ? 'Fix 1 issue to continue' : `Fix ${errorCount} issues to continue`
    : null

  // ── Address book state ──────────────────────────────────────────────
  const [teamPickerOpen, setTeamPickerOpen] = useState(false)
  const [contactPickerRow, setContactPickerRow] = useState<number | null>(null)
  const [saveTeamOpen, setSaveTeamOpen] = useState(false)
  const [saveTeamName, setSaveTeamName] = useState('')
  const [saveTeamNameErr, setSaveTeamNameErr] = useState<string | null>(null)
  const [saveTeamDone, setSaveTeamDone] = useState(false)
  // Re-read localStorage on every render so the pickers reflect the latest book state.
  // loadBook() is a simple synchronous read — safe to call during render.
  const book = loadBook()

  const loadTeam = useCallback((team: Team) => {
    // Fill name suggestion (never overwrite amount)
    const rows: RecipientRow[] = team.rows.map((r) => ({
      label: r.label,
      address: r.address,
      bps: r.bps,
    }))
    onChange({
      ...draft,
      name: draft.name || team.name,
      rows,
    })
    onTouch({
      rowAddress: rows.map(() => false),
      rowBps: rows.map(() => false),
    })
    setTeamPickerOpen(false)
  }, [draft, onChange, onTouch])

  function pickContact(i: number, contact: Contact) {
    updateRow(i, { address: contact.address, label: draft.rows[i].label || contact.label })
    setContactPickerRow(null)
  }

  function handleSaveTeam(e: React.FormEvent) {
    e.preventDefault()
    const ne = validateTeamName(saveTeamName)
    setSaveTeamNameErr(ne)
    if (ne) return
    const teamRows = draft.rows.map((r) => ({
      label: r.label || '',
      address: r.address,
      bps: r.bps,
    }))
    const r = saveTeam(saveTeamName, teamRows)
    if (!r.ok) { setSaveTeamNameErr(r.error); return }
    setSaveTeamDone(true)
    setTimeout(() => { setSaveTeamOpen(false); setSaveTeamDone(false); setSaveTeamName('') }, 1200)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
        Create a split
      </h2>

      {/* Name */}
      <Field label="Split name" error={showNameErr ? validation.nameError : null}>
        <input
          ref={nameRef}
          type="text"
          maxLength={64}
          placeholder="e.g. Q4 2026 contributors"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          onBlur={() => onTouch({ name: true })}
          className="w-full bg-transparent text-sm outline-none placeholder:opacity-40 font-medium"
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
      <Field label="Total USDC amount" error={showAmtErr ? validation.amountError : null}>
        <div className="flex items-center gap-2">
          <span className="text-base font-bold" style={{ color: 'var(--muted)' }}>$</span>
          <input
            ref={amountRef}
            inputMode="decimal"
            type="text"
            placeholder="0.00"
            value={draft.totalAmountRaw}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              onChange({ ...draft, totalAmountRaw: v, totalAmountParsed: parseUsdcInput(v) })
            }}
            onBlur={() => onTouch({ amount: true })}
            className="flex-1 bg-transparent text-lg outline-none nums font-bold placeholder:opacity-30"
            style={{ color: 'var(--ink)' }}
          />
          <span
            className="px-2 py-0.5 rounded-full text-xs font-bold"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)', border: '1px solid var(--border)' }}
          >
            USDC
          </span>
        </div>
      </Field>

      {/* Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
            Recipients ({draft.rows.length}/{MAX_RECIPIENTS})
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {book.teams.length > 0 && (
              <button
                type="button"
                onClick={() => setTeamPickerOpen(true)}
                className="chip flex items-center gap-1"
              >
                <Users className="size-3" /> Load team
              </button>
            )}
            <button
              type="button"
              onClick={fillExample}
              className="chip"
            >
              40/25/20/15
            </button>
            <button
              type="button"
              onClick={splitEvenly}
              className="chip flex items-center gap-1"
            >
              <Shuffle className="size-3" /> Even
            </button>
          </div>
        </div>

        {(touched.submitted || touched.rowAddress.some(Boolean)) && validation.recipientsError && (
          <ErrorMsg msg={validation.recipientsError} />
        )}

        <div className="flex flex-col gap-2.5">
          {draft.rows.map((row, i) => {
            const previewAmt = previewList?.[i]
            const rowErr = rowAddrTouched(i) ? validation.rowErrors[i] : null
            const roundErr = rowBpsTouched(i) ? validation.roundingErrors[i] : null
            const hasErr = !!(rowErr || roundErr)
            return (
              <div
                key={i}
                className="rounded-2xl p-4 flex flex-col gap-3"
                style={{
                  background: 'var(--card)',
                  border: `1.5px solid ${hasErr ? 'var(--danger)' : 'var(--border)'}`,
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                {/* Row header: number, label, contacts picker, delete */}
                <div className="flex items-center gap-2">
                  <span
                    className="size-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                  >
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={row.label}
                    onChange={(e) => updateRow(i, { label: e.target.value })}
                    className="flex-1 bg-transparent text-sm outline-none placeholder:opacity-40 font-medium"
                    style={{ color: 'var(--ink-2)' }}
                  />
                  {book.contacts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setContactPickerRow(i)}
                      className="icon-btn"
                      style={{ width: 26, height: 26, background: 'var(--surface-muted)', boxShadow: 'none' }}
                      aria-label="Pick from contacts"
                      title="Add from contacts"
                    >
                      <BookOpen className="size-3" style={{ color: 'var(--muted)' }} />
                    </button>
                  )}
                  {draft.rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)}
                      className="icon-btn opacity-50 hover:opacity-100 transition-opacity"
                      style={{ width: 28, height: 28, background: 'var(--surface-muted)', boxShadow: 'none' }}>
                      <Trash2 className="size-3" style={{ color: 'var(--danger)' }} />
                    </button>
                  )}
                </div>
                {/* Address */}
                <input
                  ref={(el) => { addressRefs.current[i] = el }}
                  type="text"
                  placeholder="0x wallet address"
                  value={row.address}
                  onChange={(e) => updateRow(i, { address: e.target.value.trim() })}
                  onBlur={() => touchRowAddress(i)}
                  className="w-full bg-transparent text-xs mono outline-none placeholder:opacity-40 px-3 py-2 rounded-xl"
                  style={{
                    color: 'var(--ink-2)',
                    background: 'var(--surface-muted)',
                    border: `1px solid ${rowErr ? 'var(--danger)' : 'var(--border)'}`,
                  }}
                />
                {/* Percent pill + amount */}
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full"
                    style={{
                      background: row.bps > 0 ? 'var(--accent-dim)' : 'var(--surface-muted)',
                      border: `1px solid ${row.bps > 0 ? 'var(--accent-mid)' : 'var(--border)'}`,
                    }}
                  >
                    <input
                      ref={(el) => { bpsRefs.current[i] = el }}
                      inputMode="decimal"
                      type="text"
                      placeholder="0"
                      value={row.bps > 0 ? bpsToPercent(row.bps) : ''}
                      onChange={(e) => handlePctChange(i, e.target.value)}
                      onBlur={() => touchRowBps(i)}
                      className="w-12 bg-transparent text-sm outline-none nums font-bold text-right placeholder:opacity-40"
                      style={{ color: row.bps > 0 ? 'var(--accent)' : 'var(--muted)' }}
                    />
                    <span className="text-xs font-bold" style={{ color: row.bps > 0 ? 'var(--accent)' : 'var(--subtle)' }}>%</span>
                  </div>
                  {previewAmt !== null && previewAmt !== undefined && previewAmt > 0n && (
                    <span
                      className="ml-auto text-sm nums font-bold"
                      style={{ color: exactlyFull ? 'var(--accent)' : 'var(--muted)' }}
                    >
                      {formatUsdcAmount(previewAmt, 2)} USDC
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
            className="mt-2 w-full py-2.5 rounded-2xl flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors"
            style={{ border: '1.5px dashed var(--border)', color: 'var(--muted)', background: 'transparent' }}
          >
            <Plus className="size-4" /> Add recipient
          </button>
        )}

        {/* Save as team — only show when allocation is valid */}
        {validation.valid && (
          <button
            type="button"
            onClick={() => { setSaveTeamName(draft.name); setSaveTeamOpen(true) }}
            className="mt-1 w-full py-2 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors"
            style={{ border: '1px solid var(--border)', color: 'var(--muted)', background: 'transparent' }}
          >
            <Save className="size-3.5" /> Save as team
          </button>
        )}
      </div>

      {/* ── Address book modals ──────────────────────────────────────────── */}

      {/* Team picker */}
      {teamPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(20,20,20,0.45)' }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setTeamPickerOpen(false) }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Load team"
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4 max-h-[80dvh] overflow-y-auto"
            style={{ background: 'var(--card)', boxShadow: 'var(--shadow-lift)' }}
          >
            <div className="flex items-center justify-between">
              <span className="display font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Load team</span>
              <button onClick={() => setTeamPickerOpen(false)} className="icon-btn" style={{ width: 30, height: 30 }}>
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              Loading a team fills the recipient rows and suggests the name. Your amount is not changed.
            </p>
            {book.teams.map((team) => (
              <button
                key={team.id}
                type="button"
                onClick={() => loadTeam(team)}
                className="card p-3.5 text-left flex flex-col gap-1.5 hover-lift"
                style={{ borderRadius: 16 }}
              >
                <span className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{team.name}</span>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  {team.rows.length} recipient{team.rows.length !== 1 ? 's' : ''} ·{' '}
                  {team.rows.map((r) => `${bpsToPercent(r.bps)}%`).join(' / ')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contact picker for a specific row */}
      {contactPickerRow !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(20,20,20,0.45)' }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setContactPickerRow(null) }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add from contacts"
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4 max-h-[80dvh] overflow-y-auto"
            style={{ background: 'var(--card)', boxShadow: 'var(--shadow-lift)' }}
          >
            <div className="flex items-center justify-between">
              <span className="display font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                Add from contacts
              </span>
              <button onClick={() => setContactPickerRow(null)} className="icon-btn" style={{ width: 30, height: 30 }}>
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            {book.contacts.length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: 'var(--muted)' }}>No contacts saved yet.</p>
            ) : (
              <ContactSearchList
                contacts={book.contacts}
                onPick={(c) => pickContact(contactPickerRow, c)}
              />
            )}
          </div>
        </div>
      )}

      {/* Save as team modal */}
      {saveTeamOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(20,20,20,0.45)' }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) setSaveTeamOpen(false) }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Save as team"
            className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 flex flex-col gap-4"
            style={{ background: 'var(--card)', boxShadow: 'var(--shadow-lift)' }}
          >
            <div className="flex items-center justify-between">
              <span className="display font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Save as team</span>
              <button onClick={() => setSaveTeamOpen(false)} className="icon-btn" style={{ width: 30, height: 30 }}>
                <X className="size-4" style={{ color: 'var(--muted)' }} />
              </button>
            </div>
            {saveTeamDone ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <div
                  className="size-12 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--success-bg)' }}
                >
                  <Check className="size-6" style={{ color: 'var(--success)' }} />
                </div>
                <p className="font-semibold text-sm" style={{ color: 'var(--success)' }}>Team saved!</p>
              </div>
            ) : (
              <form onSubmit={handleSaveTeam} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: 'var(--subtle)' }}>
                    Team name
                  </label>
                  <div
                    className="card px-4 py-2.5"
                    style={{ borderRadius: 14, borderColor: saveTeamNameErr ? 'var(--danger)' : 'var(--border)' }}
                  >
                    <input
                      autoFocus
                      type="text"
                      maxLength={40}
                      placeholder="e.g. Q4 contributors"
                      value={saveTeamName}
                      onChange={(e) => setSaveTeamName(e.target.value)}
                      className="w-full bg-transparent text-sm font-medium outline-none"
                      style={{ color: 'var(--ink)' }}
                    />
                  </div>
                  {saveTeamNameErr && (
                    <div className="flex items-center gap-1 mt-1">
                      <AlertCircle className="size-3 shrink-0" style={{ color: 'var(--danger)' }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{saveTeamNameErr}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                  {draft.rows.length} recipient{draft.rows.length !== 1 ? 's' : ''} ·{' '}
                  {draft.rows.map((r) => `${bpsToPercent(r.bps)}%`).join(' / ')}
                </p>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setSaveTeamOpen(false)} className="btn-ghost text-sm px-5 py-2">Cancel</button>
                  <button type="submit" className="btn-primary text-sm px-5 py-2">
                    <Save className="size-3.5" /> Save
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Live summary card */}
      <div
        className="card p-4 flex flex-col gap-2 text-sm"
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
            Summary
          </span>
          {/* Allocation ring */}
          <AllocationRing pct={Math.min(100, (allocated / 100))} full={exactlyFull} />
        </div>
        <SummaryRow label="Recipients" value={`${draft.rows.length}`} />
        <SummaryRow
          label="Allocated"
          value={`${(allocated / 100).toFixed(2)}%`}
          accent={exactlyFull}
          error={allocated > Number(BPS_DENOMINATOR)}
        />
        {remaining !== 0 && (
          <SummaryRow
            label={remaining > 0 ? 'Unallocated' : 'Over by'}
            value={`${Math.abs(remaining / 100).toFixed(2)}%`}
            error={true}
          />
        )}
        {unallocatedUsdc !== null && unallocatedUsdc > 0n && (
          <SummaryRow
            label="Unallocated USDC"
            value={`${formatUsdcAmount(unallocatedUsdc, 6)} USDC`}
            error={true}
          />
        )}
        {totalParsed !== null && totalParsed > 0n && (
          <SummaryRow label="Total" value={`${formatUsdcAmount(totalParsed, 2)} USDC`} />
        )}
        {validation.allocationError && (
          <ErrorMsg msg={validation.allocationError} />
        )}
      </div>

      {/* Review button */}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={handleNext}
          aria-disabled={!validation.valid}
          className="w-full py-3.5 rounded-full text-sm font-bold transition-all"
          style={{
            background: validation.valid ? 'var(--accent)' : 'var(--surface-muted)',
            color: validation.valid ? '#fff' : 'var(--subtle)',
            cursor: 'pointer',
            border: `1.5px solid ${validation.valid ? 'var(--accent)' : 'var(--border)'}`,
          }}
        >
          Review distribution →
        </button>
        {disableReason && (
          <p className="text-center text-xs font-medium" style={{ color: 'var(--subtle)' }}>
            {disableReason}
          </p>
        )}
      </div>
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
      <label className="block text-xs font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--subtle)' }}>
        {label}
      </label>
      <div
        className="card px-4 py-3"
        style={{
          borderColor: error ? 'var(--danger)' : 'var(--border)',
          borderRadius: 16,
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
      <span className="text-sm" style={{ color: 'var(--muted)' }}>{label}</span>
      <span
        className="font-bold nums text-sm"
        style={{ color: error ? 'var(--danger)' : accent ? 'var(--success)' : 'var(--ink-2)' }}
      >
        {value}
      </span>
    </div>
  )
}

function AllocationRing({ pct, full }: { pct: number; full: boolean }) {
  const r = 14
  const circumference = 2 * Math.PI * r
  const dash = (pct / 100) * circumference
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="ring-svg">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
      <circle
        cx="18" cy="18" r={r}
        fill="none"
        stroke={full ? 'var(--success)' : 'var(--accent)'}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        style={{ transition: 'stroke-dasharray 300ms ease' }}
      />
    </svg>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <AlertCircle className="size-3 shrink-0" style={{ color: 'var(--danger)' }} />
      <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{msg}</span>
    </div>
  )
}

function ContactSearchList({ contacts, onPick }: { contacts: Contact[]; onPick: (c: Contact) => void }) {
  const [query, setQuery] = useState('')
  const filtered = query.trim()
    ? contacts.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.address.toLowerCase().includes(query.toLowerCase()),
      )
    : contacts

  return (
    <div className="flex flex-col gap-3">
      <input
        autoFocus
        type="text"
        placeholder="Search by name or address…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="card px-4 py-2.5 w-full bg-transparent text-sm outline-none"
        style={{ borderRadius: 14, color: 'var(--ink)' }}
      />
      {filtered.length === 0 ? (
        <p className="text-sm text-center py-3" style={{ color: 'var(--muted)' }}>No matches.</p>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-colors hover-lift"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
            >
              <div
                className="size-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
              >
                {c.label.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>{c.label}</div>
                <div className="mono text-xs truncate" style={{ color: 'var(--muted)' }}>{formatAddress(c.address)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
