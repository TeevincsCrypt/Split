/**
 * Address book unit tests.
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest'
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
  validateTeamRows,
  type TeamRow,
} from './addressBook'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const A1 = '0x0000000000000000000000000000000000000001' as const
const A2 = '0x0000000000000000000000000000000000000002' as const
const A3 = '0x0000000000000000000000000000000000000003' as const

// viem getAddress checksums these to themselves (all-zero padding is deterministic)
function makeRows(n: number): TeamRow[] {
  const bps = Math.floor(10000 / n)
  const rows: TeamRow[] = []
  for (let i = 0; i < n; i++) {
    rows.push({
      label: `Recipient ${i + 1}`,
      address: `0x${String(i + 1).padStart(40, '0')}`,
      bps: i < n - 1 ? bps : 10000 - bps * (n - 1),
    })
  }
  return rows
}

// ─── localStorage mock ────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear()
})

// ─── validateLabel ────────────────────────────────────────────────────────────

describe('validateLabel', () => {
  it('accepts a normal label', () => {
    expect(validateLabel('Alice')).toBeNull()
  })
  it('rejects empty string', () => {
    expect(validateLabel('')).toBeTruthy()
    expect(validateLabel('   ')).toBeTruthy()
  })
  it('rejects > 40 chars', () => {
    expect(validateLabel('a'.repeat(41))).toBeTruthy()
    expect(validateLabel('a'.repeat(40))).toBeNull()
  })
})

// ─── validateContactAddress ───────────────────────────────────────────────────

describe('validateContactAddress', () => {
  it('accepts a valid address', () => {
    expect(validateContactAddress(A1, [])).toBeNull()
  })
  it('rejects invalid address', () => {
    expect(validateContactAddress('0xnope', [])).toBeTruthy()
  })
  it('rejects empty', () => {
    expect(validateContactAddress('', [])).toBeTruthy()
  })
  it('rejects duplicate address', () => {
    addContact('Alice', A1)
    const book = loadBook()
    expect(validateContactAddress(A1, book.contacts)).toBeTruthy()
  })
  it('allows same address when editing that contact (excludeId)', () => {
    addContact('Alice', A1)
    const book = loadBook()
    const id = book.contacts[0].id
    expect(validateContactAddress(A1, book.contacts, id)).toBeNull()
  })
})

// ─── validateTeamRows ─────────────────────────────────────────────────────────

describe('validateTeamRows', () => {
  it('accepts valid rows', () => {
    expect(validateTeamRows(makeRows(3))).toBeNull()
  })
  it('rejects empty', () => {
    expect(validateTeamRows([])).toBeTruthy()
  })
  it('rejects rows with duplicate addresses', () => {
    const rows: TeamRow[] = [
      { label: 'A', address: A1, bps: 5000 },
      { label: 'B', address: A1, bps: 5000 },
    ]
    expect(validateTeamRows(rows)).toMatch(/duplicate/i)
  })
  it('rejects when sum != 10000', () => {
    const rows: TeamRow[] = [
      { label: 'A', address: A1, bps: 4000 },
      { label: 'B', address: A2, bps: 4000 },
    ]
    expect(validateTeamRows(rows)).toMatch(/10000/i)
  })
  it('rejects zero bps', () => {
    const rows: TeamRow[] = [
      { label: 'A', address: A1, bps: 0 },
      { label: 'B', address: A2, bps: 10000 },
    ]
    expect(validateTeamRows(rows)).toBeTruthy()
  })
})

// ─── addContact ───────────────────────────────────────────────────────────────

describe('addContact', () => {
  it('adds a contact and persists it', () => {
    const r = addContact('Alice', A1)
    expect(r.ok).toBe(true)
    const book = loadBook()
    expect(book.contacts).toHaveLength(1)
    expect(book.contacts[0].label).toBe('Alice')
    // address should be checksummed
    expect(book.contacts[0].address.startsWith('0x')).toBe(true)
  })
  it('rejects duplicate address', () => {
    addContact('Alice', A1)
    const r = addContact('Alice2', A1)
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toMatch(/Already saved/i)
  })
  it('rejects bad label', () => {
    const r = addContact('', A1)
    expect(r.ok).toBe(false)
  })
  it('rejects invalid address', () => {
    const r = addContact('Alice', 'notanaddress')
    expect(r.ok).toBe(false)
  })
})

// ─── updateContact ────────────────────────────────────────────────────────────

describe('updateContact', () => {
  it('updates label and address', () => {
    addContact('Alice', A1)
    const id = loadBook().contacts[0].id
    const r = updateContact(id, 'Bob', A2)
    expect(r.ok).toBe(true)
    const book = loadBook()
    expect(book.contacts[0].label).toBe('Bob')
    expect(book.contacts[0].address.toLowerCase()).toBe(A2.toLowerCase())
  })
  it('allows updating to the same address (editing own record)', () => {
    addContact('Alice', A1)
    const id = loadBook().contacts[0].id
    const r = updateContact(id, 'Alice Renamed', A1)
    expect(r.ok).toBe(true)
  })
  it('rejects updating to an address already used by another contact', () => {
    addContact('Alice', A1)
    addContact('Bob', A2)
    const book = loadBook()
    const aliceId = book.contacts[0].id
    const r = updateContact(aliceId, 'Alice', A2)
    expect(r.ok).toBe(false)
  })
  it('returns error for unknown id', () => {
    const r = updateContact('nonexistent', 'X', A1)
    expect(r.ok).toBe(false)
  })
})

// ─── removeContact ────────────────────────────────────────────────────────────

describe('removeContact', () => {
  it('removes a contact', () => {
    addContact('Alice', A1)
    const id = loadBook().contacts[0].id
    const r = removeContact(id)
    expect(r.ok).toBe(true)
    expect(loadBook().contacts).toHaveLength(0)
  })
  it('returns error for unknown id', () => {
    const r = removeContact('ghost')
    expect(r.ok).toBe(false)
  })
})

// ─── saveTeam / renameTeam / deleteTeam ───────────────────────────────────────

describe('saveTeam', () => {
  it('saves a valid team', () => {
    const r = saveTeam('Contribs', makeRows(3))
    expect(r.ok).toBe(true)
    expect(loadBook().teams).toHaveLength(1)
    expect(loadBook().teams[0].name).toBe('Contribs')
  })
  it('rejects bad name', () => {
    const r = saveTeam('', makeRows(3))
    expect(r.ok).toBe(false)
  })
  it('rejects invalid rows (bad sum)', () => {
    const rows: TeamRow[] = [
      { label: 'A', address: A1, bps: 3000 },
      { label: 'B', address: A2, bps: 3000 },
    ]
    const r = saveTeam('Bad', rows)
    expect(r.ok).toBe(false)
  })
})

describe('renameTeam', () => {
  it('renames a team', () => {
    saveTeam('Old', makeRows(2))
    const id = loadBook().teams[0].id
    const r = renameTeam(id, 'New')
    expect(r.ok).toBe(true)
    expect(loadBook().teams[0].name).toBe('New')
  })
  it('rejects empty name', () => {
    saveTeam('Old', makeRows(2))
    const id = loadBook().teams[0].id
    const r = renameTeam(id, '')
    expect(r.ok).toBe(false)
  })
  it('returns error for unknown id', () => {
    const r = renameTeam('ghost', 'X')
    expect(r.ok).toBe(false)
  })
})

describe('deleteTeam', () => {
  it('deletes a team', () => {
    saveTeam('T', makeRows(2))
    const id = loadBook().teams[0].id
    const r = deleteTeam(id)
    expect(r.ok).toBe(true)
    expect(loadBook().teams).toHaveLength(0)
  })
  it('returns error for unknown id', () => {
    const r = deleteTeam('ghost')
    expect(r.ok).toBe(false)
  })
})

// ─── export / import ──────────────────────────────────────────────────────────

describe('exportBook / importBook', () => {
  it('round-trips contacts and teams', () => {
    addContact('Alice', A1)
    saveTeam('Contribs', makeRows(3))
    const json = exportBook()
    localStorage.clear()
    const r = importBook(json)
    expect(r.ok).toBe(true)
    expect(r.contactsAdded).toBe(1)
    expect(r.teamsAdded).toBe(1)
    expect(r.skipped).toBe(0)
    const book = loadBook()
    expect(book.contacts[0].label).toBe('Alice')
    expect(book.teams[0].name).toBe('Contribs')
  })
  it('skips malformed contacts and reports them', () => {
    const json = JSON.stringify({
      version: 1,
      contacts: [
        { label: 'Good', address: A2 },
        { label: '', address: A3 }, // bad label
        { label: 'NoAddr' },         // missing address
      ],
      teams: [],
    })
    const r = importBook(json)
    expect(r.contactsAdded).toBe(1)
    expect(r.skipped).toBe(2)
    expect(r.errors.length).toBeGreaterThanOrEqual(2)
  })
  it('skips malformed teams and reports them', () => {
    const json = JSON.stringify({
      version: 1,
      contacts: [],
      teams: [
        { name: 'Good', rows: makeRows(2) },
        { name: '', rows: makeRows(2) },         // bad name
        { name: 'BadRows', rows: [{ label: 'A', address: A1, bps: 9000 }] }, // bad sum
      ],
    })
    const r = importBook(json)
    expect(r.teamsAdded).toBe(1)
    expect(r.skipped).toBe(2)
  })
  it('rejects invalid JSON', () => {
    const r = importBook('{not json}')
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/JSON/i)
  })
  it('does not import duplicate contacts from a second import', () => {
    addContact('Alice', A1)
    const json = exportBook()
    const r = importBook(json)
    // A1 is already in the book — should be skipped
    expect(r.contactsAdded).toBe(0)
    expect(r.skipped).toBeGreaterThanOrEqual(1)
  })
})
