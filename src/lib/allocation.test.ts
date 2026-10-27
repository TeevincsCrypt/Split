import { describe, it, expect } from 'vitest'
import {
  computeAmounts,
  previewAmounts,
  percentToBps,
  bpsToPercent,
  parseUsdcInput,
  formatUsdcAmount,
  equalBps,
  sumBps,
  BPS_DENOMINATOR,
} from './allocation'

describe('computeAmounts', () => {
  it('single recipient gets total', () => {
    const amounts = computeAmounts(100_000_000n, [10_000])
    expect(amounts).toEqual([100_000_000n])
  })

  it('40/25/20/15 of 100 USDC', () => {
    // 100 USDC = 100_000_000 micro-USDC
    const total = 100_000_000n
    const bps = [4000, 2500, 2000, 1500]
    const amounts = computeAmounts(total, bps)
    expect(amounts[0]).toBe(40_000_000n)
    expect(amounts[1]).toBe(25_000_000n)
    expect(amounts[2]).toBe(20_000_000n)
    expect(amounts[3]).toBe(15_000_000n)
    expect(amounts.reduce((a, b) => a + b, 0n)).toBe(total)
  })

  it('3333/3333/3334 bps — remainder goes to last', () => {
    // 100 units (not USDC scale, just 100n)
    const total = 100n
    const bps = [3333, 3333, 3334]
    const amounts = computeAmounts(total, bps)
    // floor(100 * 3333 / 10000) = floor(33.33) = 33
    expect(amounts[0]).toBe(33n)
    expect(amounts[1]).toBe(33n)
    expect(amounts[2]).toBe(34n) // remainder
    expect(amounts.reduce((a, b) => a + b, 0n)).toBe(total)
  })

  it('always sums to totalAmount', () => {
    const cases: [bigint, number[]][] = [
      [1000000n, [5000, 5000]],
      [1000003n, [3333, 3333, 3334]],
      [7n, [2000, 8000]],
      [1n, [10_000]],
    ]
    for (const [total, bps] of cases) {
      const amounts = computeAmounts(total, bps)
      const sum = amounts.reduce((a, b) => a + b, 0n)
      expect(sum).toBe(total)
    }
  })

  it('returns empty array for empty bps', () => {
    expect(computeAmounts(1000n, [])).toEqual([])
  })
})

describe('percentToBps', () => {
  it('parses integer percentages', () => {
    expect(percentToBps('40')).toBe(4000)
    expect(percentToBps('100')).toBe(10_000)
    expect(percentToBps('0')).toBe(0)
  })

  it('parses one decimal', () => {
    expect(percentToBps('12.5')).toBe(1250)
  })

  it('parses two decimals', () => {
    expect(percentToBps('0.01')).toBe(1)
    expect(percentToBps('33.33')).toBe(3333)
  })

  it('rejects more than 2 decimals', () => {
    expect(percentToBps('12.345')).toBeNull()
  })

  it('rejects non-numeric', () => {
    expect(percentToBps('abc')).toBeNull()
    expect(percentToBps('')).toBeNull()
  })
})

describe('bpsToPercent', () => {
  it('formats whole percentages', () => {
    expect(bpsToPercent(4000)).toBe('40')
    expect(bpsToPercent(10_000)).toBe('100')
  })

  it('formats fractional percentages', () => {
    expect(bpsToPercent(1250)).toBe('12.50')
    expect(bpsToPercent(1)).toBe('0.01')
  })
})

describe('parseUsdcInput', () => {
  it('parses valid integers', () => {
    expect(parseUsdcInput('100')).toBe(100_000_000n)
    expect(parseUsdcInput('1')).toBe(1_000_000n)
  })

  it('parses decimals up to 6 places', () => {
    expect(parseUsdcInput('1.5')).toBe(1_500_000n)
    expect(parseUsdcInput('0.000001')).toBe(1n)
  })

  it('rejects more than 6 decimal places', () => {
    expect(parseUsdcInput('1.0000001')).toBeNull()
  })

  it('rejects empty / non-numeric', () => {
    expect(parseUsdcInput('')).toBeNull()
    expect(parseUsdcInput('abc')).toBeNull()
    expect(parseUsdcInput('-1')).toBeNull()
  })
})

describe('formatUsdcAmount', () => {
  it('formats with 2 decimal places', () => {
    expect(formatUsdcAmount(100_000_000n)).toBe('100.00')
    expect(formatUsdcAmount(1_500_000n)).toBe('1.50')
    expect(formatUsdcAmount(1n)).toBe('0.00') // rounds down (display only)
  })

  it('formats with 6 decimal places', () => {
    expect(formatUsdcAmount(1n, 6)).toBe('0.000001')
  })
})

describe('equalBps', () => {
  it('splits 2 equally', () => {
    const bps = equalBps(2)
    expect(sumBps(bps)).toBe(10_000)
    expect(bps[0]).toBe(bps[1])
  })

  it('splits 3 with remainder to last', () => {
    const bps = equalBps(3)
    expect(sumBps(bps)).toBe(10_000)
    expect(bps[2]).toBeGreaterThanOrEqual(bps[0])
  })

  it('returns empty for n=0', () => {
    expect(equalBps(0)).toEqual([])
  })
})

describe('sumBps', () => {
  it('sums correctly', () => {
    expect(sumBps([4000, 2500, 2000, 1500])).toBe(10_000)
    expect(sumBps([])).toBe(0)
  })

  it('detects invalid totals', () => {
    expect(sumBps([5000, 5001])).not.toBe(Number(BPS_DENOMINATOR))
  })
})

describe('previewAmounts', () => {
  it('valid allocation — matches computeAmounts exactly (remainder to last)', () => {
    // sum = 10_000, so preview == computeAmounts
    const total = 1_000_000n // 1.000000 USDC
    const bps = [4000, 2500, 2000, 1500]
    const preview = previewAmounts(total, bps)
    const exact = computeAmounts(total, bps)
    expect(preview).toEqual(exact.map((a) => a))
  })

  it('valid allocation — 3-way rounding remainder goes to last', () => {
    const total = 1_000_001n
    const bps = [3333, 3333, 3334]
    const preview = previewAmounts(total, bps)
    // floor(1_000_001 * 3333 / 10_000) = 333300 for first two
    expect(preview[0]).toBe(333_300n)
    expect(preview[1]).toBe(333_300n)
    // last gets remainder: 1_000_001 - 333_300 - 333_300 = 333_401
    expect(preview[2]).toBe(333_401n)
    const sum = (preview as bigint[]).reduce((a, b) => a + b, 0n)
    expect(sum).toBe(total)
  })

  it('invalid allocation (9900 bps) — floor only, no remainder rule', () => {
    // The bug case: 100 USDC, bps [3900, 2500, 2000, 1500] sum = 9900
    const total = 100_000_000n // 100 USDC
    const bps = [3900, 2500, 2000, 1500]
    const preview = previewAmounts(total, bps)
    // Each row is strictly floor(total * bps[i] / 10_000)
    expect(preview[0]).toBe(39_000_000n) // floor(100 * 39 / 100)
    expect(preview[1]).toBe(25_000_000n)
    expect(preview[2]).toBe(20_000_000n)
    expect(preview[3]).toBe(15_000_000n) // NOT 16_000_000
    // Sum < total (1_000_000 unallocated)
    const sum = (preview as bigint[]).reduce((a, b) => a + b, 0n)
    expect(sum).toBeLessThan(total)
    expect(sum).toBe(99_000_000n)
  })

  it('invalid allocation (over 10_000) — floor only', () => {
    const total = 100_000_000n
    const bps = [5000, 5001] // 10001
    const preview = previewAmounts(total, bps)
    expect(preview[0]).toBe(50_000_000n)
    expect(preview[1]).toBe(50_010_000n) // floor only, no remainder correction
  })

  it('returns null for bps=0 rows in invalid allocation', () => {
    const total = 1_000_000n
    const bps = [5000, 0, 5000] // sum = 10000 but row 2 is 0
    const preview = previewAmounts(total, bps)
    // sum IS 10_000, so computeAmounts path; bps[1]=0 → null
    expect(preview[1]).toBeNull()
  })

  it('returns null for bps=0 rows in under-allocation', () => {
    const total = 1_000_000n
    const bps = [5000, 0, 4000] // sum = 9000
    const preview = previewAmounts(total, bps)
    expect(preview[1]).toBeNull()
    expect(preview[0]).toBe(500_000n)
    expect(preview[2]).toBe(400_000n)
  })

  it('returns empty array for empty bps', () => {
    expect(previewAmounts(1_000_000n, [])).toEqual([])
  })

  it('unallocated amount: preview sums show gap', () => {
    // 1 USDC, bps [4000, 2500] = 6500 bps, 3500 unallocated
    const total = 1_000_000n
    const bps = [4000, 2500]
    const preview = previewAmounts(total, bps)
    expect(preview[0]).toBe(400_000n)
    expect(preview[1]).toBe(250_000n)
    const sum = (preview as bigint[]).reduce((a, b) => a + b, 0n)
    // 350_000 unallocated
    expect(total - sum).toBe(350_000n)
  })
})
