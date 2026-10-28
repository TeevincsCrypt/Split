import { useState, useRef, useEffect } from 'react'
import { Users, UserPlus, Trash2, Pencil, Copy, Download, Upload, X, Check, AlertCircle, BookOpen } from 'lucide-react'
import {
  loadBook,
  addContact,
  updateContact,
  removeContact,
  saveTeam,
  renameTeam,
  deleteTeam,
  exportBook,
  importBook,
  validateLabel,
  validateContactAddress,
  validateTeamName,
  type Contact,
  type Team,
  type TeamRow,
} from '@/lib/addressBook'
import { validateTeamRows } from '@/lib/addressBook'
import { formatAddress } from '@/lib/utils'
import { bpsToPercent, percentToBps, equalBps, sumBps } from '@/lib/allocation'

// ─── Modal helper ─────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(20,20,20,0.45)' }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 flex flex-col gap-5 max-h-[85dvh] overflow-y-auto"
        style={{ background: 'var(--card)', boxShadow: 'var(--shadow-lift)' }}
      >
        <div className="flex items-center justify-between">
          <h2 id="modal-title" className="display font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            {title}
          </h2>
          <button onClick={onClose} className="icon-btn" style={{ width: 32, height: 32 }}>
            <X className="size-4" style={{ color: 'var(--muted)' }} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmModal({ open, onClose, onConfirm, title, body }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body: string
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>{body}</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="btn-ghost text-sm px-5 py-2">Cancel</button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className="btn-primary text-sm px-5 py-2"
          style={{ background: 'var(--danger)' }}
        >
          Delete
        </button>
      </div>
    </Modal>
  )
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button
      onClick={copy}
      className="icon-btn"
      style={{ width: 30, height: 30, background: 'var(--surface-muted)', boxShadow: 'none' }}
      aria-label="Copy address"
    >
      {copied
        ? <Check className="size-3.5" style={{ color: 'var(--success)' }} />
        : <Copy className="size-3.5" style={{ color: 'var(--muted)' }} />
      }
    </button>
  )
}

// ─── Error inline ─────────────────────────────────────────────────────────────

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null
  return (
    <div className="flex items-center gap-1.5">
      <AlertCircle className="size-3.5 shrink-0" style={{ color: 'var(--danger)' }} />
      <span className="text-xs font-medium" style={{ color: 'var(--danger)' }}>{msg}</span>
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function FieldBox({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>{label}</label>
      <div
        className="card px-4 py-2.5"
        style={{ borderRadius: 14, borderColor: error ? 'var(--danger)' : 'var(--border)' }}
      >
        {children}
      </div>
      <Err msg={error ?? null} />
    </div>
  )
}

// ─── Contact form ─────────────────────────────────────────────────────────────

function ContactForm({ initial, excludeId, onSave, onCancel }: {
  initial?: { label: string; address: string }
  excludeId?: string
  onSave: (label: string, address: string) => string | null
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [labelErr, setLabelErr] = useState<string | null>(null)
  const [addrErr, setAddrErr] = useState<string | null>(null)
  const [submitErr, setSubmitErr] = useState<string | null>(null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const le = validateLabel(label)
    const book = loadBook()
    const ae = validateContactAddress(address, book.contacts, excludeId)
    setLabelErr(le)
    setAddrErr(ae)
    if (le || ae) return
    const err = onSave(label, address)
    if (err) setSubmitErr(err)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <FieldBox label="Label" error={labelErr}>
        <input
          autoFocus
          type="text"
          maxLength={40}
          placeholder="e.g. Alice"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => setLabelErr(validateLabel(label))}
          className="w-full bg-transparent text-sm font-medium outline-none"
          style={{ color: 'var(--ink)' }}
        />
      </FieldBox>
      <FieldBox label="Wallet address" error={addrErr}>
        <input
          type="text"
          placeholder="0x..."
          value={address}
          onChange={(e) => setAddress(e.target.value.trim())}
          onBlur={() => setAddrErr(validateContactAddress(address, loadBook().contacts, excludeId))}
          className="w-full bg-transparent text-xs mono outline-none"
          style={{ color: 'var(--ink)' }}
        />
      </FieldBox>
      <Err msg={submitErr} />
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={onCancel} className="btn-ghost text-sm px-5 py-2">Cancel</button>
        <button type="submit" className="btn-primary text-sm px-5 py-2">Save</button>
      </div>
    </form>
  )
}

// ─── Team row editor (within the save-team modal) ─────────────────────────────

function TeamRowEditor({ rows, onChange }: {
  rows: TeamRow[]
  onChange: (rows: TeamRow[]) => void
}) {
  function updateRow(i: number, patch: Partial<TeamRow>) {
    onChange(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }
  function addRow() {
    onChange([...rows, { label: '', address: '', bps: 0 }])
  }
  function removeRow(i: number) {
    if (rows.length <= 1) return
    onChange(rows.filter((_, idx) => idx !== i))
  }
  function splitEvenly() {
    const bps = equalBps(rows.length)
    onChange(rows.map((r, i) => ({ ...r, bps: bps[i] })))
  }

  const sum = sumBps(rows.map((r) => r.bps))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
          Recipients ({rows.length})
        </span>
        <div className="flex gap-1.5">
          <button type="button" onClick={splitEvenly} className="chip text-xs">Even split</button>
        </div>
      </div>

      {rows.map((row, i) => (
        <div
          key={i}
          className="rounded-2xl p-3 flex flex-col gap-2"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
            >
              {i + 1}
            </span>
            <input
              type="text"
              placeholder="Label"
              maxLength={40}
              value={row.label}
              onChange={(e) => updateRow(i, { label: e.target.value })}
              className="flex-1 bg-transparent text-sm outline-none font-medium"
              style={{ color: 'var(--ink)' }}
            />
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full"
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-mid)' }}
            >
              <input
                inputMode="decimal"
                type="text"
                placeholder="0"
                value={row.bps > 0 ? bpsToPercent(row.bps) : ''}
                onChange={(e) => {
                  const bps = percentToBps(e.target.value)
                  updateRow(i, { bps: bps ?? 0 })
                }}
                className="w-10 bg-transparent text-xs nums font-bold text-right outline-none"
                style={{ color: 'var(--accent)' }}
              />
              <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>%</span>
            </div>
            {rows.length > 1 && (
              <button type="button" onClick={() => removeRow(i)}
                className="icon-btn" style={{ width: 26, height: 26, background: 'transparent', boxShadow: 'none' }}
              >
                <Trash2 className="size-3" style={{ color: 'var(--danger)' }} />
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="0x wallet address"
            value={row.address}
            onChange={(e) => updateRow(i, { address: e.target.value.trim() })}
            className="w-full bg-transparent text-xs mono outline-none px-2 py-1.5 rounded-xl"
            style={{
              color: 'var(--ink)',
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="w-full py-2 rounded-2xl text-sm font-semibold"
        style={{ border: '1.5px dashed var(--border)', color: 'var(--muted)', background: 'transparent' }}
      >
        + Add recipient
      </button>

      {/* BPS sum indicator */}
      <div className="flex items-center justify-between text-xs font-semibold" style={{ color: sum === 10000 ? 'var(--success)' : 'var(--danger)' }}>
        <span>Total allocated</span>
        <span className="nums">{(sum / 100).toFixed(2)}%</span>
      </div>
    </div>
  )
}

// ─── Contacts tab ─────────────────────────────────────────────────────────────

function ContactsTab({ contacts, onRefresh }: { contacts: Contact[]; onRefresh: () => void }) {
  const [addOpen, setAddOpen] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function handleAdd(label: string, address: string): string | null {
    const r = addContact(label, address)
    if (!r.ok) return r.error
    onRefresh()
    setAddOpen(false)
    return null
  }
  function handleEdit(label: string, address: string): string | null {
    if (!editContact) return null
    const r = updateContact(editContact.id, label, address)
    if (!r.ok) return r.error
    onRefresh()
    setEditContact(null)
    return null
  }
  function handleDelete() {
    if (!deleteId) return
    removeContact(deleteId)
    onRefresh()
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <div
          className="size-16 rounded-full flex items-center justify-center"
          style={{ background: 'var(--accent-dim)' }}
        >
          <BookOpen className="size-7" style={{ color: 'var(--accent)' }} />
        </div>
        <p className="text-sm font-medium text-center" style={{ color: 'var(--muted)', maxWidth: 220 }}>
          No contacts saved yet. Add an address to reuse it in future splits.
        </p>
        <button onClick={() => setAddOpen(true)} className="btn-primary">
          <UserPlus className="size-4" /> Add contact
        </button>
        <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add contact">
          <ContactForm onSave={handleAdd} onCancel={() => setAddOpen(false)} />
        </Modal>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
          {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
        </span>
        <button onClick={() => setAddOpen(true)} className="btn-primary" style={{ padding: '7px 14px', fontSize: 12 }}>
          <UserPlus className="size-3.5" /> Add
        </button>
      </div>

      {contacts.map((c) => (
        <div
          key={c.id}
          className="card p-4 flex items-center gap-3"
          style={{ borderRadius: 18 }}
        >
          <div
            className="size-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
          >
            {c.label.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>{c.label}</div>
            <div className="mono text-xs truncate" style={{ color: 'var(--muted)' }}>{formatAddress(c.address)}</div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <CopyButton text={c.address} />
            <button
              onClick={() => setEditContact(c)}
              className="icon-btn"
              style={{ width: 30, height: 30, background: 'var(--surface-muted)', boxShadow: 'none' }}
              aria-label="Edit contact"
            >
              <Pencil className="size-3.5" style={{ color: 'var(--muted)' }} />
            </button>
            <button
              onClick={() => setDeleteId(c.id)}
              className="icon-btn"
              style={{ width: 30, height: 30, background: 'var(--surface-muted)', boxShadow: 'none' }}
              aria-label="Delete contact"
            >
              <Trash2 className="size-3.5" style={{ color: 'var(--danger)' }} />
            </button>
          </div>
        </div>
      ))}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add contact">
        <ContactForm onSave={handleAdd} onCancel={() => setAddOpen(false)} />
      </Modal>

      <Modal open={!!editContact} onClose={() => setEditContact(null)} title="Edit contact">
        <ContactForm
          initial={editContact ? { label: editContact.label, address: editContact.address } : undefined}
          excludeId={editContact?.id}
          onSave={handleEdit}
          onCancel={() => setEditContact(null)}
        />
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete contact?"
        body="This contact will be removed from your device. Teams that reference this address are not affected."
      />
    </div>
  )
}

// ─── Teams tab ────────────────────────────────────────────────────────────────

function TeamsTab({ teams, onRefresh }: { teams: Team[]; onRefresh: () => void }) {
  const [saveOpen, setSaveOpen] = useState(false)
  const [editTeam, setEditTeam] = useState<Team | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saveRows, setSaveRows] = useState<TeamRow[]>([{ label: '', address: '', bps: 0 }])
  const [saveName, setSaveName] = useState('')
  const [saveNameErr, setSaveNameErr] = useState<string | null>(null)
  const [saveRowsErr, setSaveRowsErr] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editNameErr, setEditNameErr] = useState<string | null>(null)

  function handleSaveTeam(e: React.FormEvent) {
    e.preventDefault()
    const ne = validateTeamName(saveName)
    const re = validateTeamRows(saveRows)
    setSaveNameErr(ne)
    setSaveRowsErr(re)
    if (ne || re) return
    const r = saveTeam(saveName, saveRows)
    if (!r.ok) { setSaveRowsErr(r.error); return }
    onRefresh()
    setSaveOpen(false)
    setSaveName('')
    setSaveRows([{ label: '', address: '', bps: 0 }])
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault()
    const ne = validateTeamName(editName)
    setEditNameErr(ne)
    if (ne || !editTeam) return
    const r = renameTeam(editTeam.id, editName)
    if (!r.ok) { setEditNameErr(r.error); return }
    onRefresh()
    setEditTeam(null)
  }

  function handleDelete() {
    if (!deleteId) return
    deleteTeam(deleteId)
    onRefresh()
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <div
          className="size-16 rounded-full flex items-center justify-center"
          style={{ background: 'var(--accent-dim)' }}
        >
          <Users className="size-7" style={{ color: 'var(--accent)' }} />
        </div>
        <p className="text-sm font-medium text-center" style={{ color: 'var(--muted)', maxWidth: 240 }}>
          No teams saved yet. Save a recipient list to load it quickly next time.
        </p>
        <button onClick={() => setSaveOpen(true)} className="btn-primary">
          <Users className="size-4" /> New team
        </button>

        <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="New team">
          <form onSubmit={handleSaveTeam} className="flex flex-col gap-4">
            <FieldBox label="Team name" error={saveNameErr}>
              <input
                autoFocus
                type="text"
                maxLength={40}
                placeholder="e.g. Q4 contributors"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="w-full bg-transparent text-sm font-medium outline-none"
                style={{ color: 'var(--ink)' }}
              />
            </FieldBox>
            <TeamRowEditor rows={saveRows} onChange={setSaveRows} />
            <Err msg={saveRowsErr} />
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setSaveOpen(false)} className="btn-ghost text-sm px-5 py-2">Cancel</button>
              <button type="submit" className="btn-primary text-sm px-5 py-2">Save team</button>
            </div>
          </form>
        </Modal>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
          {teams.length} team{teams.length !== 1 ? 's' : ''}
        </span>
        <button onClick={() => setSaveOpen(true)} className="btn-primary" style={{ padding: '7px 14px', fontSize: 12 }}>
          <Users className="size-3.5" /> New team
        </button>
      </div>

      {teams.map((team) => (
        <div key={team.id} className="card p-4 flex flex-col gap-3" style={{ borderRadius: 20 }}>
          <div className="flex items-center justify-between gap-2">
            <div className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{team.name}</div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => { setEditTeam(team); setEditName(team.name) }}
                className="icon-btn"
                style={{ width: 30, height: 30, background: 'var(--surface-muted)', boxShadow: 'none' }}
                aria-label="Rename team"
              >
                <Pencil className="size-3.5" style={{ color: 'var(--muted)' }} />
              </button>
              <button
                onClick={() => setDeleteId(team.id)}
                className="icon-btn"
                style={{ width: 30, height: 30, background: 'var(--surface-muted)', boxShadow: 'none' }}
                aria-label="Delete team"
              >
                <Trash2 className="size-3.5" style={{ color: 'var(--danger)' }} />
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {team.rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="size-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                  >
                    {i + 1}
                  </span>
                  <span className="font-medium truncate" style={{ color: 'var(--ink-2)' }}>{r.label || formatAddress(r.address)}</span>
                  <span className="mono hidden sm:block" style={{ color: 'var(--subtle)' }}>{formatAddress(r.address)}</span>
                </div>
                <span
                  className="nums font-bold shrink-0 px-2 py-0.5 rounded-full text-[11px]"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}
                >
                  {bpsToPercent(r.bps)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="New team">
        <form onSubmit={handleSaveTeam} className="flex flex-col gap-4">
          <FieldBox label="Team name" error={saveNameErr}>
            <input
              autoFocus
              type="text"
              maxLength={40}
              placeholder="e.g. Q4 contributors"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="w-full bg-transparent text-sm font-medium outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </FieldBox>
          <TeamRowEditor rows={saveRows} onChange={setSaveRows} />
          <Err msg={saveRowsErr} />
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setSaveOpen(false)} className="btn-ghost text-sm px-5 py-2">Cancel</button>
            <button type="submit" className="btn-primary text-sm px-5 py-2">Save team</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editTeam} onClose={() => setEditTeam(null)} title="Rename team">
        <form onSubmit={handleRename} className="flex flex-col gap-4">
          <FieldBox label="Team name" error={editNameErr}>
            <input
              autoFocus
              type="text"
              maxLength={40}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-transparent text-sm font-medium outline-none"
              style={{ color: 'var(--ink)' }}
            />
          </FieldBox>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setEditTeam(null)} className="btn-ghost text-sm px-5 py-2">Cancel</button>
            <button type="submit" className="btn-primary text-sm px-5 py-2">Save</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete team?"
        body="This team will be removed from your device. Distributions already made are not affected."
      />
    </div>
  )
}

// ─── Export / Import bar ──────────────────────────────────────────────────────

function ImportExportBar({ onRefresh }: { onRefresh: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [importError, setImportError] = useState(false)

  function handleExport() {
    const json = exportBook()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `split-recipients-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const result = importBook(text)
      if (!result.ok && result.contactsAdded === 0 && result.teamsAdded === 0) {
        setImportError(true)
        setImportMsg(`Import failed: ${result.errors[0] ?? 'Unknown error.'}`)
      } else {
        setImportError(false)
        const parts: string[] = []
        if (result.contactsAdded > 0) parts.push(`${result.contactsAdded} contact${result.contactsAdded !== 1 ? 's' : ''}`)
        if (result.teamsAdded > 0) parts.push(`${result.teamsAdded} team${result.teamsAdded !== 1 ? 's' : ''}`)
        if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
        setImportMsg(`Imported: ${parts.join(', ') || 'nothing new'}.`)
        onRefresh()
      }
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(() => setImportMsg(null), 4000)
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button onClick={handleExport} className="btn-ghost text-xs gap-1.5 flex-1" style={{ padding: '8px 12px' }}>
          <Download className="size-3.5" /> Export JSON
        </button>
        <button onClick={() => fileRef.current?.click()} className="btn-ghost text-xs gap-1.5 flex-1" style={{ padding: '8px 12px' }}>
          <Upload className="size-3.5" /> Import JSON
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImport} />
      </div>
      {importMsg && (
        <p className="text-xs text-center font-medium" style={{ color: importError ? 'var(--danger)' : 'var(--success)' }}>
          {importMsg}
        </p>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'contacts' | 'teams'

export default function Recipients() {
  const [tab, setTab] = useState<Tab>('contacts')
  const [book, setBook] = useState(() => loadBook())
  function refresh() { setBook(loadBook()) }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-5">
      {/* Page header */}
      <div>
        <h1 className="display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
          Recipients
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Saved on this device only — not stored onchain.
        </p>
      </div>

      {/* Tabs */}
      <div
        className="flex p-1 rounded-full gap-1"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
      >
        {(['contacts', 'teams'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 rounded-full text-sm font-bold transition-all"
            style={
              tab === t
                ? { background: 'var(--card)', color: 'var(--ink)', boxShadow: 'var(--shadow-card)' }
                : { background: 'transparent', color: 'var(--muted)' }
            }
          >
            {t === 'contacts' ? (
              <span className="flex items-center justify-center gap-1.5">
                <UserPlus className="size-3.5" /> Contacts
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <Users className="size-3.5" /> Teams
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'contacts'
        ? <ContactsTab contacts={book.contacts} onRefresh={refresh} />
        : <TeamsTab teams={book.teams} onRefresh={refresh} />
      }

      {/* Export / Import */}
      <div className="card p-4" style={{ borderRadius: 20 }}>
        <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--subtle)' }}>
          Backup &amp; restore
        </p>
        <ImportExportBar onRefresh={refresh} />
      </div>
    </div>
  )
}
