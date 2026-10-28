/**
 * ScheduledSplitArtifact integrity tests.
 * Verifies the embedded creation bytecode matches the expected keccak256.
 * If you recompile, update EXPECTED_KECCAK256 to match the new artifact.
 */
import { describe, it, expect } from 'vitest'
import { keccak256, toBytes } from 'viem'
import {
  SCHEDULED_SPLIT_ABI_JSON,
  SCHEDULED_SPLIT_BYTECODE,
  SCHEDULED_SPLIT_DEPLOYED_BYTECODE,
  SCHEDULED_SPLIT_BYTECODE_KECCAK256,
} from '@/abi/ScheduledSplitArtifact'

const EXPECTED_KECCAK256 = '0x1cbb74ed08ae9f55c91c8e3af90192cf707e5c6ba78a895851d77ab94fea41b9'

describe('ScheduledSplitArtifact', () => {
  it('creation bytecode keccak256 matches expected value', () => {
    const actual = keccak256(toBytes(SCHEDULED_SPLIT_BYTECODE))
    expect(actual).toBe(EXPECTED_KECCAK256)
  })

  it('SCHEDULED_SPLIT_BYTECODE_KECCAK256 export matches expected value', () => {
    expect(SCHEDULED_SPLIT_BYTECODE_KECCAK256).toBe(EXPECTED_KECCAK256)
  })

  it('creation bytecode starts with 0x and has non-zero length', () => {
    expect(SCHEDULED_SPLIT_BYTECODE).toMatch(/^0x[0-9a-f]+$/i)
    expect(SCHEDULED_SPLIT_BYTECODE.length).toBeGreaterThan(100)
  })

  it('deployed bytecode starts with 0x and has non-zero length', () => {
    expect(SCHEDULED_SPLIT_DEPLOYED_BYTECODE).toMatch(/^0x[0-9a-f]+$/i)
    expect(SCHEDULED_SPLIT_DEPLOYED_BYTECODE.length).toBeGreaterThan(100)
  })

  it('ABI includes expected public functions', () => {
    const names = SCHEDULED_SPLIT_ABI_JSON
      .filter((e) => 'name' in e && e.type === 'function')
      .map((e) => (e as { name: string }).name)
    expect(names).toContain('createSchedule')
    expect(names).toContain('execute')
    expect(names).toContain('cancel')
    expect(names).toContain('getSchedule')
    expect(names).toContain('nextDueTime')
    expect(names).toContain('isDue')
    expect(names).toContain('remainingDeposit')
    expect(names).toContain('previewAmounts')
    expect(names).toContain('scheduleCount')
    expect(names).toContain('usdc')
    expect(names).toContain('MAX_RECIPIENTS')
    expect(names).toContain('MAX_PAYMENTS')
    expect(names).toContain('BPS_DENOMINATOR')
  })
})
