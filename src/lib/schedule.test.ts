import { describe, it, expect } from 'vitest'
import {
  computeDueTimes,
  parseDatetimeLocal,
  selectDueSchedules,
  selectUpcomingSchedules,
  formatCountdown,
  type ScheduleSummary,
} from './schedule'

// ---------------------------------------------------------------------------
// parseDatetimeLocal
// ---------------------------------------------------------------------------
describe('parseDatetimeLocal', () => {
  it('parses a valid datetime-local string', () => {
    const d = parseDatetimeLocal('2027-03-15T09:00')
    expect(d).not.toBeNull()
    expect(d!.getFullYear()).toBe(2027)
    expect(d!.getMonth()).toBe(2) // March = 2
    expect(d!.getDate()).toBe(15)
    expect(d!.getHours()).toBe(9)
  })

  it('returns null for empty string', () => {
    expect(parseDatetimeLocal('')).toBeNull()
  })

  it('returns null for invalid string', () => {
    expect(parseDatetimeLocal('not-a-date')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// computeDueTimes — none (one-off)
// ---------------------------------------------------------------------------
describe('computeDueTimes – none (one-off)', () => {
  it('returns a single due time', () => {
    const result = computeDueTimes({ firstDatetime: '2027-06-01T10:00', repeat: 'none', count: 1 })
    expect(result).not.toBeNull()
    expect(result!.dueTimes).toHaveLength(1)
    expect(result!.labels).toHaveLength(1)
    expect(result!.utcLabels).toHaveLength(1)
  })

  it('count=1 with repeat=none always gives exactly 1 entry', () => {
    const result = computeDueTimes({ firstDatetime: '2027-01-15T12:00', repeat: 'none', count: 3 })
    // repeat=none means only the first date even when count>1
    expect(result!.dueTimes).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// computeDueTimes — weekly
// ---------------------------------------------------------------------------
describe('computeDueTimes – weekly', () => {
  it('produces dates exactly 7 days apart', () => {
    const result = computeDueTimes({ firstDatetime: '2027-01-01T09:00', repeat: 'weekly', count: 4 })
    expect(result).not.toBeNull()
    const times = result!.dueTimes.map(Number)
    expect(times).toHaveLength(4)
    const sevenDays = 7 * 24 * 3600
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBe(sevenDays)
    }
  })
})

// ---------------------------------------------------------------------------
// computeDueTimes — biweekly
// ---------------------------------------------------------------------------
describe('computeDueTimes – biweekly', () => {
  it('produces dates exactly 14 days apart', () => {
    const result = computeDueTimes({ firstDatetime: '2027-01-01T09:00', repeat: 'biweekly', count: 3 })
    const times = result!.dueTimes.map(Number)
    const fourteen = 14 * 24 * 3600
    for (let i = 1; i < times.length; i++) {
      expect(times[i] - times[i - 1]).toBe(fourteen)
    }
  })
})

// ---------------------------------------------------------------------------
// computeDueTimes — monthly
// ---------------------------------------------------------------------------
describe('computeDueTimes – monthly', () => {
  it('same day-of-month across months', () => {
    const result = computeDueTimes({ firstDatetime: '2027-01-15T09:00', repeat: 'monthly', count: 3 })
    expect(result).not.toBeNull()
    const dates = result!.dueTimes.map((t) => new Date(Number(t) * 1000))
    expect(dates[0].getDate()).toBe(15)
    expect(dates[1].getDate()).toBe(15)
    expect(dates[2].getDate()).toBe(15)
    expect(dates[1].getMonth()).toBe(dates[0].getMonth() + 1)
    expect(dates[2].getMonth()).toBe(dates[0].getMonth() + 2)
  })

  it('Jan 31 → Feb 28 (non-leap year)', () => {
    // 2027 is not a leap year
    const result = computeDueTimes({ firstDatetime: '2027-01-31T12:00', repeat: 'monthly', count: 2 })
    const dates = result!.dueTimes.map((t) => new Date(Number(t) * 1000))
    expect(dates[0].getDate()).toBe(31)
    expect(dates[1].getMonth()).toBe(1) // February
    expect(dates[1].getDate()).toBe(28)
  })

  it('Jan 31 → Feb 29 (leap year)', () => {
    // 2028 IS a leap year
    const result = computeDueTimes({ firstDatetime: '2028-01-31T12:00', repeat: 'monthly', count: 2 })
    const dates = result!.dueTimes.map((t) => new Date(Number(t) * 1000))
    expect(dates[1].getMonth()).toBe(1)
    expect(dates[1].getDate()).toBe(29)
  })

  it('Mar 31 → Apr 30 (April has 30 days)', () => {
    const result = computeDueTimes({ firstDatetime: '2027-03-31T12:00', repeat: 'monthly', count: 2 })
    const dates = result!.dueTimes.map((t) => new Date(Number(t) * 1000))
    expect(dates[1].getMonth()).toBe(3) // April
    expect(dates[1].getDate()).toBe(30)
  })
})

// ---------------------------------------------------------------------------
// computeDueTimes — validation / edge cases
// ---------------------------------------------------------------------------
describe('computeDueTimes – validation', () => {
  it('returns null for empty firstDatetime', () => {
    expect(computeDueTimes({ firstDatetime: '', repeat: 'none', count: 1 })).toBeNull()
  })

  it('returns null for count 0', () => {
    expect(computeDueTimes({ firstDatetime: '2027-01-01T09:00', repeat: 'weekly', count: 0 })).toBeNull()
  })

  it('returns null for count 25', () => {
    expect(computeDueTimes({ firstDatetime: '2027-01-01T09:00', repeat: 'weekly', count: 25 })).toBeNull()
  })

  it('produces exactly count entries for weekly/24', () => {
    const result = computeDueTimes({ firstDatetime: '2027-01-01T09:00', repeat: 'weekly', count: 24 })
    expect(result!.dueTimes).toHaveLength(24)
  })

  it('dueTimes are strictly increasing', () => {
    const result = computeDueTimes({ firstDatetime: '2027-01-01T09:00', repeat: 'monthly', count: 12 })
    const times = result!.dueTimes
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1])
    }
  })
})

// ---------------------------------------------------------------------------
// selectDueSchedules
// ---------------------------------------------------------------------------
describe('selectDueSchedules', () => {
  const now = 1_800_000_000n // arbitrary unix sec

  const schedules: ScheduleSummary[] = [
    { id: 1n, nextDueTime: now - 100n, cancelled: false, executed: 0, totalPayments: 3 }, // due
    { id: 2n, nextDueTime: now + 600n, cancelled: false, executed: 1, totalPayments: 3 }, // upcoming
    { id: 3n, nextDueTime: now - 50n,  cancelled: true,  executed: 0, totalPayments: 3 }, // cancelled
    { id: 4n, nextDueTime: 0n,          cancelled: false, executed: 3, totalPayments: 3 }, // complete
    { id: 5n, nextDueTime: now,         cancelled: false, executed: 0, totalPayments: 1 }, // exactly now
  ]

  it('returns only due (nextDueTime <= now, not cancelled, not complete)', () => {
    const due = selectDueSchedules(schedules, now)
    expect(due).toContain(1n)
    expect(due).toContain(5n)
    expect(due).not.toContain(2n) // upcoming
    expect(due).not.toContain(3n) // cancelled
    expect(due).not.toContain(4n) // complete
  })

  it('returns empty array when nothing is due', () => {
    const all_future: ScheduleSummary[] = [
      { id: 1n, nextDueTime: now + 3600n, cancelled: false, executed: 0, totalPayments: 1 },
    ]
    expect(selectDueSchedules(all_future, now)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// selectUpcomingSchedules
// ---------------------------------------------------------------------------
describe('selectUpcomingSchedules', () => {
  const now = 1_800_000_000n

  it('returns only upcoming, sorted by nextDueTime', () => {
    const schedules: ScheduleSummary[] = [
      { id: 3n, nextDueTime: now + 7200n, cancelled: false, executed: 0, totalPayments: 2 },
      { id: 1n, nextDueTime: now + 3600n, cancelled: false, executed: 0, totalPayments: 2 },
      { id: 2n, nextDueTime: now - 100n,  cancelled: false, executed: 0, totalPayments: 2 }, // due
      { id: 4n, nextDueTime: now + 1800n, cancelled: true,  executed: 0, totalPayments: 2 }, // cancelled
    ]
    const upcoming = selectUpcomingSchedules(schedules, now)
    expect(upcoming.map((s) => s.id)).toEqual([1n, 3n])
  })
})

// ---------------------------------------------------------------------------
// formatCountdown
// ---------------------------------------------------------------------------
describe('formatCountdown', () => {
  const now = 1_800_000_000n

  it('returns "Due now" when at or past due', () => {
    expect(formatCountdown(now, now)).toBe('Due now')
    expect(formatCountdown(now - 1n, now)).toBe('Due now')
  })

  it('formats seconds', () => {
    expect(formatCountdown(now + 45n, now)).toBe('45s')
  })

  it('formats minutes', () => {
    expect(formatCountdown(now + 125n, now)).toBe('2m')
  })

  it('formats hours+minutes', () => {
    expect(formatCountdown(now + 3725n, now)).toBe('1h 2m')
  })

  it('formats days+hours', () => {
    expect(formatCountdown(now + BigInt(2 * 86400 + 5 * 3600), now)).toBe('2d 5h')
  })

  it('formats whole days (no hours)', () => {
    expect(formatCountdown(now + BigInt(3 * 86400), now)).toBe('3d')
  })
})
