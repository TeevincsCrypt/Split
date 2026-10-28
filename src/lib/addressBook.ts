/**
 * Address book — localStorage, versioned schema, all accesses wrapped in try/catch.
 * Key: "split.addressBook.v1"
 * Never throws to callers — every mutation returns { ok, error }.
 */

import { isAddress, getAddress } from 'viem'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Contact {
  id: string            // uuid-ish, generated on save
  label: string         // 1–40 chars
  address: `0x${string}` // checksummed EIP-55
  addedAt: number       // Date.now()
}

export interface TeamRow {
  label: string         // 1–40 chars (contact label / freeform)
  address: string       // checksummed address
  bps: number           // 1–10000, sum over the team must equal 10000
}

export interface Team {
  id: string
  name: string          // 1–40 chars
  rows: TeamRow[]
  savedAt: number
}

export interface AddressBook {
  version: 1
  contacts: Contact[]
  teams: Team[]
}

export type MutResult = { ok: true } | { ok: false; error: string }

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'split.addressBook.v1'

// ─── Validation helpers ───────────────────────────────────────────────────────

export function validateLabel(label: string): string | null {
  const t = label.trim()
  if (t.length === 0) return 'Label is required.'
  if (t.length > 40) return 'Label must be at most 40 characters.'
  return null
}

export function validateContactAddress(address: string, existingContacts: Contact[], excludeId?: string): string | null {
  const t = address.trim()
  if (!t) return 'Address is required.'
  if (!isAddress(t)) return 'Invalid EVM address.'
  const checksummed = getAddress(t)
  const dup = existingContacts.find(
    (c) => c.address.toLowerCase() === checksummed.toLowerCase() && c.id !== excludeId
  )
  if (dup) return `Already saved as "${dup.label}".`
  return null
}

export function validateTeamName(name: string): string | null {
  const t = name.trim()
  if (t.length === 0) return 'Team name is required.'
  if (t.length > 40) return 'Team name must be at most 40 characters.'
  return null
}

export function validateTeamRows(rows: TeamRow[]): string | null {
  if (rows.length === 0) return 'A team needs at least one recipient.'
  if (rows.length > 50) return 'Maximum 50 recipients per team.'
  const seenAddresses = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const labelErr = validateLabel(r.label)
    if (labelErr) return `Row ${i + 1}: ${labelErr}`
    if (!isAddress(r.address)) return `Row ${i + 1}: invalid address.`
    const lower = r.address.toLowerCase()
    if (seenAddresses.has(lower)) return `Row ${i + 1}: duplicate address.`
    seenAddresses.add(lower)
    if (r.bps <= 0 || r.bps > 10000) return `Row ${i + 1}: allocation must be between 1 and 10000 bps.`
  }
  const sum = rows.reduce((acc, r) => acc + r.bps, 0)
  if (sum !== 10000) return `Allocations must sum to 100% (10000 bps). Current sum: ${sum}.`
  return null
}

// ─── Storage ─────────────────────────────────────────────────────────────────

function emptyBook(): AddressBook {
  return { version: 1, contacts: [], teams: [] }
}

export function loadBook(): AddressBook {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyBook()
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' || parsed === null ||
      (parsed as AddressBook).version !== 1 ||
      !Array.isArray((parsed as AddressBook).contacts) ||
      !Array.isArray((parsed as AddressBook).teams)
    ) {
      return emptyBook()
    }
    return parsed as AddressBook
  } catch {
    return emptyBook()
  }
}

function saveBook(book: AddressBook): MutResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(book))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Storage write failed.' }
  }
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

// ─── Contact CRUD ─────────────────────────────────────────────────────────────

export function addContact(label: string, address: string): MutResult {
  const book = loadBook()
  const labelErr = validateLabel(label)
  if (labelErr) return { ok: false, error: labelErr }
  const addrErr = validateContactAddress(address, book.contacts)
  if (addrErr) return { ok: false, error: addrErr }
  const contact: Contact = {
    id: makeId(),
    label: label.trim(),
    address: getAddress(address.trim()),
    addedAt: Date.now(),
  }
  book.contacts.push(contact)
  return saveBook(book)
}

export function updateContact(id: string, label: string, address: string): MutResult {
  const book = loadBook()
  const idx = book.contacts.findIndex((c) => c.id === id)
  if (idx === -1) return { ok: false, error: 'Contact not found.' }
  const labelErr = validateLabel(label)
  if (labelErr) return { ok: false, error: labelErr }
  const addrErr = validateContactAddress(address, book.contacts, id)
  if (addrErr) return { ok: false, error: addrErr }
  book.contacts[idx] = {
    ...book.contacts[idx],
    label: label.trim(),
    address: getAddress(address.trim()),
  }
  return saveBook(book)
}

export function removeContact(id: string): MutResult {
  const book = loadBook()
  const before = book.contacts.length
  book.contacts = book.contacts.filter((c) => c.id !== id)
  if (book.contacts.length === before) return { ok: false, error: 'Contact not found.' }
  return saveBook(book)
}

// ─── Team CRUD ────────────────────────────────────────────────────────────────

export function saveTeam(name: string, rows: TeamRow[]): MutResult {
  const book = loadBook()
  const nameErr = validateTeamName(name)
  if (nameErr) return { ok: false, error: nameErr }
  const rowsErr = validateTeamRows(rows)
  if (rowsErr) return { ok: false, error: rowsErr }
  const team: Team = {
    id: makeId(),
    name: name.trim(),
    rows: rows.map((r) => ({ ...r, label: r.label.trim(), address: getAddress(r.address) })),
    savedAt: Date.now(),
  }
  book.teams.push(team)
  return saveBook(book)
}

export function renameTeam(id: string, name: string): MutResult {
  const book = loadBook()
  const idx = book.teams.findIndex((t) => t.id === id)
  if (idx === -1) return { ok: false, error: 'Team not found.' }
  const nameErr = validateTeamName(name)
  if (nameErr) return { ok: false, error: nameErr }
  book.teams[idx] = { ...book.teams[idx], name: name.trim() }
  return saveBook(book)
}

export function deleteTeam(id: string): MutResult {
  const book = loadBook()
  const before = book.teams.length
  book.teams = book.teams.filter((t) => t.id !== id)
  if (book.teams.length === before) return { ok: false, error: 'Team not found.' }
  return saveBook(book)
}

// ─── Export / Import ──────────────────────────────────────────────────────────

export interface ImportResult {
  ok: boolean
  contactsAdded: number
  teamsAdded: number
  skipped: number
  errors: string[]
}

export function exportBook(): string {
  const book = loadBook()
  return JSON.stringify({ version: 1, contacts: book.contacts, teams: book.teams }, null, 2)
}

export function importBook(jsonString: string): ImportResult {
  const result: ImportResult = { ok: false, contactsAdded: 0, teamsAdded: 0, skipped: 0, errors: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonString)
  } catch {
    result.errors.push('Invalid JSON.')
    return result
  }
  if (typeof parsed !== 'object' || parsed === null) {
    result.errors.push('Expected a JSON object.')
    return result
  }
  const raw = parsed as Record<string, unknown>
  const book = loadBook()

  // Import contacts
  if (Array.isArray(raw.contacts)) {
    for (const item of raw.contacts) {
      if (
        typeof item !== 'object' || item === null ||
        typeof (item as Record<string, unknown>).label !== 'string' ||
        typeof (item as Record<string, unknown>).address !== 'string'
      ) {
        result.skipped++
        result.errors.push('Skipped a contact: missing label or address.')
        continue
      }
      const c = item as { label: string; address: string }
      const labelErr = validateLabel(c.label)
      const addrErr = validateContactAddress(c.address, book.contacts)
      if (labelErr || addrErr) {
        result.skipped++
        result.errors.push(`Skipped contact "${c.label}": ${labelErr ?? addrErr}`)
        continue
      }
      book.contacts.push({
        id: makeId(),
        label: c.label.trim(),
        address: getAddress(c.address.trim()),
        addedAt: Date.now(),
      })
      result.contactsAdded++
    }
  }

  // Import teams
  if (Array.isArray(raw.teams)) {
    for (const item of raw.teams) {
      if (
        typeof item !== 'object' || item === null ||
        typeof (item as Record<string, unknown>).name !== 'string' ||
        !Array.isArray((item as Record<string, unknown>).rows)
      ) {
        result.skipped++
        result.errors.push('Skipped a team: missing name or rows.')
        continue
      }
      const t = item as { name: string; rows: unknown[] }
      const nameErr = validateTeamName(t.name)
      if (nameErr) {
        result.skipped++
        result.errors.push(`Skipped team "${t.name}": ${nameErr}`)
        continue
      }

      // Validate rows
      const parsedRows: TeamRow[] = []
      let rowError: string | null = null
      for (let i = 0; i < t.rows.length; i++) {
        const r = t.rows[i]
        if (
          typeof r !== 'object' || r === null ||
          typeof (r as Record<string, unknown>).label !== 'string' ||
          typeof (r as Record<string, unknown>).address !== 'string' ||
          typeof (r as Record<string, unknown>).bps !== 'number'
        ) {
          rowError = `Row ${i + 1}: invalid structure.`
          break
        }
        const rr = r as { label: string; address: string; bps: number }
        parsedRows.push({ label: rr.label, address: rr.address, bps: rr.bps })
      }
      if (rowError) {
        result.skipped++
        result.errors.push(`Skipped team "${t.name}": ${rowError}`)
        continue
      }
      const rowsErr = validateTeamRows(parsedRows)
      if (rowsErr) {
        result.skipped++
        result.errors.push(`Skipped team "${t.name}": ${rowsErr}`)
        continue
      }
      book.teams.push({
        id: makeId(),
        name: t.name.trim(),
        rows: parsedRows.map((r) => ({ ...r, label: r.label.trim(), address: getAddress(r.address) })),
        savedAt: Date.now(),
      })
      result.teamsAdded++
    }
  }

  const saved = saveBook(book)
  if (!saved.ok) {
    result.errors.push(saved.error)
    return result
  }
  result.ok = true
  return result
}
