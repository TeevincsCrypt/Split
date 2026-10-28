/**
 * Schedule date-math and due-selection helpers.
 * Pure functions — no side effects, no imports from wagmi/viem.
 */

export type RepeatMode = 'none' | 'weekly' | 'biweekly' | 'monthly'

export interface ScheduleFormValues {
  /** Local datetime string from <input type="datetime-local"> */
  firstDatetime: string
  repeat: RepeatMode
  /** 1–24 */
  count: number
}

export interface ComputedDueTimes {
  /** Unix seconds (bigint), for the contract */
  dueTimes: bigint[]
  /** Human-readable labels in local timezone */
  labels: string[]
  /** UTC equivalents for display */
  utcLabels: string[]
}

/**
 * Compute the i-th payment date (i >= 1) anchored to the FIRST payment date.
 *
 * This avoids cumulative drift: calling addInterval on the previously clamped
 * date causes Jan 31 → Feb 28 → Mar 28 → Apr 28, but anchoring to first gives
 * Jan 31 → Feb 28/29 → Mar 31 → Apr 30 → May 31 … as expected.
 *
 * - Weekly / biweekly: first + i×7 or i×14 days, applied via setDate so DST
 *   transitions do not shift the wall-clock hour.
 * - Monthly: same day-of-month and time as `first`, month + i, clamped to the
 *   last day of that month.
 */
function nthPaymentDate(first: Date, i: number, mode: RepeatMode): Date {
  if (mode === 'weekly' || mode === 'biweekly') {
    const days = mode === 'weekly' ? 7 * i : 14 * i
    const d = new Date(first)
    d.setDate(d.getDate() + days)
    return d
  }
  // monthly
  const origDay   = first.getDate()
  const origMonth = first.getMonth()   // 0-indexed
  const origYear  = first.getFullYear()

  const totalMonths = origMonth + i
  const targetYear  = origYear + Math.floor(totalMonths / 12)
  const targetMonth = totalMonths % 12                          // 0-indexed

  // Last calendar day of the target month
  const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate()
  const clampedDay = origDay > lastDay ? lastDay : origDay

  const d = new Date(first)
  // Set year/month/day atomically to avoid intermediate overflow
  d.setFullYear(targetYear, targetMonth, clampedDay)
  return d
}

const dtFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
  timeZoneName: 'short',
})

const utcFmt = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric', month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
})

/**
 * Parse a datetime-local string into a Date in the user's local timezone.
 * datetime-local is "YYYY-MM-DDTHH:mm" with no timezone — treated as local.
 */
export function parseDatetimeLocal(value: string): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Compute the list of due times from the schedule form.
 * Returns null when inputs are invalid (bad date, count out of range).
 */
export function computeDueTimes(values: ScheduleFormValues): ComputedDueTimes | null {
  const { firstDatetime, repeat, count } = values
  if (count < 1 || count > 24) return null
  const first = parseDatetimeLocal(firstDatetime)
  if (!first) return null

  const dates: Date[] = [first]
  for (let i = 1; i < count; i++) {
    if (repeat === 'none') break
    dates.push(nthPaymentDate(first, i, repeat))
  }

  return {
    dueTimes: dates.map((d) => BigInt(Math.floor(d.getTime() / 1000))),
    labels: dates.map((d) => dtFmt.format(d)),
    utcLabels: dates.map((d) => utcFmt.format(d)),
  }
}

/** Returns the user's local timezone name (e.g. "America/New_York" or "UTC+5"). */
export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// ---------------------------------------------------------------------------
// Keeper-bot due-selection logic (pure — tested in vitest, used by keeper.ts)
// ---------------------------------------------------------------------------

export interface ScheduleSummary {
  id: bigint
  /** unix seconds; 0 means done or cancelled */
  nextDueTime: bigint
  cancelled: boolean
  executed: number
  totalPayments: number
}

/**
 * Given a list of schedules and the current unix-second timestamp,
 * return the ids of schedules that are due (nextDueTime > 0 and <= nowSec).
 * Does NOT include cancelled or completed schedules.
 */
export function selectDueSchedules(schedules: ScheduleSummary[], nowSec: bigint): bigint[] {
  return schedules
    .filter((s) => !s.cancelled && s.nextDueTime > 0n && s.nextDueTime <= nowSec)
    .map((s) => s.id)
}

/**
 * Given a list of schedules, return those that are upcoming (nextDueTime > nowSec,
 * not cancelled, not completed), sorted by nextDueTime ascending.
 */
export function selectUpcomingSchedules(schedules: ScheduleSummary[], nowSec: bigint): ScheduleSummary[] {
  return schedules
    .filter((s) => !s.cancelled && s.nextDueTime > 0n && s.nextDueTime > nowSec)
    .sort((a, b) => (a.nextDueTime < b.nextDueTime ? -1 : a.nextDueTime > b.nextDueTime ? 1 : 0))
}

/** Format a countdown to a due time. Returns "Due now" when <= 0. */
export function formatCountdown(dueSec: bigint, nowSec: bigint): string {
  const diff = Number(dueSec - nowSec)
  if (diff <= 0) return 'Due now'
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`
  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`
}

/** Format a unix-seconds timestamp to a short local datetime string. */
export function formatDueTime(dueSec: bigint): string {
  return dtFmt.format(new Date(Number(dueSec) * 1000))
}
