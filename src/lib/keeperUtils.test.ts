/**
 * Unit tests for scripts/keeper-utils.ts
 * Pure helpers only — no env, no network, no private keys.
 */
import { describe, it, expect } from 'vitest'
import {
  redactUrls,
  safeErrorMessage,
  buildRpcList,
  parseNetwork,
  EXPECTED_CHAIN_ID,
  batchedSettle,
} from '../../scripts/keeper-utils.ts'

// ---------------------------------------------------------------------------
// redactUrls
// ---------------------------------------------------------------------------
describe('redactUrls', () => {
  it('redacts an https URL', () => {
    const result = redactUrls('Error: connect ECONNREFUSED https://rpc.example.com/v3/secretkey123')
    expect(result).not.toContain('secretkey123')
    expect(result).toContain('https://[redacted]')
  })

  it('redacts an http URL', () => {
    const result = redactUrls('Failed to fetch http://localhost:8545/something?key=abc')
    expect(result).not.toContain('abc')
    expect(result).toContain('http://[redacted]')
  })

  it('redacts multiple URLs in one string', () => {
    const msg = 'tried https://rpc.a.io/key1 then https://rpc.b.io/key2'
    const result = redactUrls(msg)
    expect(result).not.toContain('key1')
    expect(result).not.toContain('key2')
    expect(result.match(/\[redacted\]/g)?.length).toBe(2)
  })

  it('leaves non-URL text unchanged', () => {
    const plain = 'Contract reverted: execution reverted'
    expect(redactUrls(plain)).toBe(plain)
  })

  it('handles an empty string', () => {
    expect(redactUrls('')).toBe('')
  })

  it('preserves the scheme prefix', () => {
    const result = redactUrls('see https://rpc.arc.io/v1/mykey for details')
    expect(result).toContain('https://[redacted]')
    expect(result).toContain('for details')
  })
})

// ---------------------------------------------------------------------------
// safeErrorMessage
// ---------------------------------------------------------------------------
describe('safeErrorMessage', () => {
  it('extracts shortMessage from viem-style error', () => {
    const err = { shortMessage: 'execution reverted', message: 'long message with url https://rpc.io/key' }
    expect(safeErrorMessage(err)).toBe('execution reverted')
  })

  it('falls back to message when shortMessage absent', () => {
    const err = new Error('failed to fetch https://rpc.io/secretkey')
    const result = safeErrorMessage(err)
    expect(result).not.toContain('secretkey')
    expect(result).toContain('https://[redacted]')
  })

  it('handles null/undefined', () => {
    expect(safeErrorMessage(null)).toBe('unknown error')
    expect(safeErrorMessage(undefined)).toBe('unknown error')
  })

  it('handles a plain string error', () => {
    expect(safeErrorMessage('oops')).toBe('oops')
  })
})

// ---------------------------------------------------------------------------
// buildRpcList
// ---------------------------------------------------------------------------
describe('buildRpcList', () => {
  it('returns testnet defaults without an override', () => {
    const list = buildRpcList('testnet')
    expect(list[0]).toBe('https://rpc.testnet.arc.io')
    expect(list.length).toBeGreaterThanOrEqual(2)
  })

  it('returns mainnet default without an override', () => {
    const list = buildRpcList('mainnet')
    expect(list[0]).toBe('https://rpc.mainnet.arc.io')
  })

  it('places the override first', () => {
    const list = buildRpcList('testnet', 'https://custom.rpc.io/key')
    expect(list[0]).toBe('https://custom.rpc.io/key')
    expect(list).toContain('https://rpc.testnet.arc.io')
  })

  it('deduplicates when override matches a default', () => {
    const list = buildRpcList('testnet', 'https://rpc.testnet.arc.io')
    const count = list.filter((u) => u === 'https://rpc.testnet.arc.io').length
    expect(count).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// parseNetwork
// ---------------------------------------------------------------------------
describe('parseNetwork', () => {
  it('accepts "testnet"', () => {
    expect(parseNetwork('testnet')).toBe('testnet')
  })

  it('accepts "mainnet"', () => {
    expect(parseNetwork('mainnet')).toBe('mainnet')
  })

  it('defaults to testnet when undefined', () => {
    expect(parseNetwork(undefined)).toBe('testnet')
  })

  it('is case-insensitive', () => {
    expect(parseNetwork('Testnet')).toBe('testnet')
    expect(parseNetwork('MAINNET')).toBe('mainnet')
  })

  it('throws on unknown value', () => {
    expect(() => parseNetwork('staging')).toThrow(/testnet.*mainnet/i)
  })

  it('throws on empty string', () => {
    expect(() => parseNetwork('')).toThrow()
  })
})

// ---------------------------------------------------------------------------
// EXPECTED_CHAIN_ID
// ---------------------------------------------------------------------------
describe('EXPECTED_CHAIN_ID', () => {
  it('has correct testnet chain id', () => {
    expect(EXPECTED_CHAIN_ID.testnet).toBe(5042002)
  })

  it('has correct mainnet chain id', () => {
    expect(EXPECTED_CHAIN_ID.mainnet).toBe(5042)
  })
})

// ---------------------------------------------------------------------------
// batchedSettle
// ---------------------------------------------------------------------------
describe('batchedSettle', () => {
  it('resolves all successes', async () => {
    const items = [1, 2, 3]
    const results = await batchedSettle(items, 2, (n) => Promise.resolve(n * 2))
    expect(results).toEqual([
      { ok: true, value: 2 },
      { ok: true, value: 4 },
      { ok: true, value: 6 },
    ])
  })

  it('captures failures without throwing', async () => {
    const items = [1, 2, 3]
    const results = await batchedSettle(items, 2, (n) => {
      if (n === 2) return Promise.reject(new Error('fail'))
      return Promise.resolve(n)
    })
    expect(results[0]).toEqual({ ok: true, value: 1 })
    expect(results[1].ok).toBe(false)
    expect(results[2]).toEqual({ ok: true, value: 3 })
  })

  it('preserves result order regardless of concurrency', async () => {
    const items = [3, 1, 2]
    // Each task takes (item * 10)ms so they finish out-of-order
    const results = await batchedSettle(items, 3, (n) =>
      new Promise<number>((res) => setTimeout(() => res(n), n * 10))
    )
    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([3, 1, 2])
  })

  it('handles empty input', async () => {
    const results = await batchedSettle([], 5, (n: number) => Promise.resolve(n))
    expect(results).toEqual([])
  })

  it('works with concurrency=1 (serial)', async () => {
    const order: number[] = []
    await batchedSettle([1, 2, 3], 1, (n) => {
      order.push(n)
      return Promise.resolve(n)
    })
    expect(order).toEqual([1, 2, 3])
  })

  it('clamps concurrency to item count', async () => {
    const results = await batchedSettle([42], 100, (n) => Promise.resolve(n))
    expect(results).toEqual([{ ok: true, value: 42 }])
  })
})
