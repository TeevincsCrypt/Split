import { describe, it, expect } from 'vitest'
import {
  computeAmounts,
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
