/**
 * Pure bigint allocation math mirroring SplitDistributor exactly.
 * All amounts in USDC smallest units (6 decimals). BPS_DENOMINATOR = 10_000.
 */

import { parseUnits } from 'viem'

export const BPS_DENOMINATOR = 10_000n
export const USDC_DECIMALS = 6

/**
 * Compute per-recipient amounts from totalAmount and bps array.
 * Mirrors contract: floor for i < n-1, last recipient gets remainder.
 * Does NOT validate recipients — call validateSplit separately.
 */
export function computeAmounts(totalAmount: bigint, bps: number[]): bigint[] {
  const n = bps.length
  if (n === 0) return []
  const amounts: bigint[] = new Array<bigint>(n)
  let distributed = 0n
  for (let i = 0; i < n - 1; i++) {
    const amount = (totalAmount * BigInt(bps[i])) / BPS_DENOMINATOR
    amounts[i] = amount
    distributed += amount
  }
  amounts[n - 1] = totalAmount - distributed
  return amounts
}

/**
 * Parse a percent string (e.g. "40", "12.5", "0.01") into basis points.
 * Rejects more than 2 decimal places.
 * Returns null on invalid input.
 */
export function percentToBps(pct: string): number | null {
  const trimmed = pct.trim()
  if (trimmed === '' || isNaN(Number(trimmed))) return null
  const match = trimmed.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return null
  const whole = parseInt(match[1], 10)
  const frac = match[2] ? parseInt(match[2].padEnd(2, '0'), 10) : 0
  const bps = whole * 100 + frac
  if (bps < 0 || bps > BPS_DENOMINATOR) return null
  return bps
}

/**
 * Format basis points as a percent string (e.g. 4000 -> "40", 2500 -> "25", 1 -> "0.01").
 */
export function bpsToPercent(bps: number): string {
  const whole = Math.floor(bps / 100)
  const frac = bps % 100
  if (frac === 0) return `${whole}`
  return `${whole}.${String(frac).padStart(2, '0')}`
}

/**
 * Parse a USDC display string into smallest units (bigint, 6 decimals).
 * Rejects: negative, more than 6 decimal places, non-numeric, empty.
 * Returns null on invalid input.
 */
export function parseUsdcInput(value: string): bigint | null {
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '.') return null
  if (!/^\d*\.?\d*$/.test(trimmed)) return null
  if (trimmed.startsWith('-')) return null
  const [, frac] = trimmed.split('.')
  if (frac && frac.length > USDC_DECIMALS) return null
  if (trimmed === '0' || trimmed === '0.') return 0n
  try {
    return parseUnits(trimmed, USDC_DECIMALS)
  } catch {
    return null
  }
}

/**
 * Format a bigint USDC raw amount to a human-readable string with fixed decimals.
 */
export function formatUsdcAmount(raw: bigint, decimals = 2): string {
  const divisor = 10n ** BigInt(USDC_DECIMALS)
  const whole = raw / divisor
  const frac = raw % divisor
  const fracStr = String(frac).padStart(USDC_DECIMALS, '0').slice(0, decimals)
  if (decimals === 0) return String(whole)
  return `${whole}.${fracStr}`
}

/**
 * Split equally among n recipients (bps summing to 10000).
 * The last recipient absorbs rounding remainder.
 */
export function equalBps(n: number): number[] {
  if (n <= 0) return []
  const denom = Number(BPS_DENOMINATOR)
  const share = Math.floor(denom / n)
  const bps = new Array<number>(n).fill(share)
  bps[n - 1] = denom - share * (n - 1)
  return bps
}

/**
 * Sum of basis points.
 */
export function sumBps(bps: number[]): number {
  return bps.reduce((a, b) => a + b, 0)
}
