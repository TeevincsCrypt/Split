/**
 * Client-side validation mirroring SplitDistributor's on-chain checks.
 * Returns string error messages or null if valid.
 */

import { isAddress, getAddress } from 'viem'
import { computeAmounts, sumBps } from './allocation'
import { MAX_RECIPIENTS, BPS_DENOMINATOR } from '@/config/networks'
import { ACTIVE_NETWORK } from '@/config/networks'

export interface RecipientRow {
  label: string
  address: string
  bps: number // basis points, 0 if not yet set
}

export interface ValidationResult {
  valid: boolean
  nameError: string | null
  amountError: string | null
  recipientsError: string | null
  rowErrors: (string | null)[]
  allocationError: string | null
  roundingErrors: (string | null)[]
}

export function validateSplit(
  name: string,
  totalAmount: bigint | null,
  rows: RecipientRow[],
): ValidationResult {
  const result: ValidationResult = {
    valid: false,
    nameError: null,
    amountError: null,
    recipientsError: null,
    rowErrors: rows.map(() => null),
    allocationError: null,
    roundingErrors: rows.map(() => null),
  }

  // Name: 1–64 bytes UTF-8
  const nameBytes = new TextEncoder().encode(name.trim())
  if (nameBytes.length === 0) result.nameError = 'Name is required.'
  else if (nameBytes.length > 64) result.nameError = 'Name must be at most 64 bytes.'

  // totalAmount
  if (totalAmount === null) result.amountError = 'Enter a valid USDC amount.'
  else if (totalAmount === 0n) result.amountError = 'Amount must be greater than zero.'

  // Recipients count
  if (rows.length === 0) {
    result.recipientsError = 'Add at least one recipient.'
  } else if (rows.length > MAX_RECIPIENTS) {
    result.recipientsError = `Maximum ${MAX_RECIPIENTS} recipients allowed.`
  }

  // Per-row checks
  const seenAddresses = new Set<string>()
  const contractAddress = ACTIVE_NETWORK.distributorAddress?.toLowerCase()
  const usdcAddress = ACTIVE_NETWORK.usdcAddress.toLowerCase()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const addr = row.address.trim()
    if (!addr) {
      result.rowErrors[i] = 'Address is required.'
      continue
    }
    if (!isAddress(addr)) {
      result.rowErrors[i] = 'Invalid address.'
      continue
    }
    const checksummed = getAddress(addr)
    const lower = checksummed.toLowerCase()
    if (lower === '0x0000000000000000000000000000000000000000') {
      result.rowErrors[i] = 'Zero address not allowed.'
    } else if (contractAddress && lower === contractAddress) {
      result.rowErrors[i] = 'Cannot send to the contract itself.'
    } else if (lower === usdcAddress) {
      result.rowErrors[i] = 'Cannot send to the USDC token address.'
    } else if (seenAddresses.has(lower)) {
      result.rowErrors[i] = 'Duplicate address.'
    } else {
      seenAddresses.add(lower)
    }
  }

  // BPS: each > 0, sum == 10_000
  const bpsValues = rows.map((r) => r.bps)
  for (let i = 0; i < bpsValues.length; i++) {
    if (bpsValues[i] === 0) {
      result.allocationError = result.allocationError ?? `Row ${i + 1}: allocation must be > 0.`
    }
  }
  const total = sumBps(bpsValues)
  if (total !== BPS_DENOMINATOR && rows.length > 0) {
    const remaining = BPS_DENOMINATOR - total
    if (remaining > 0) {
      result.allocationError = `${remaining / 100}% (${remaining} bps) unallocated.`
    } else {
      result.allocationError = `Over-allocated by ${(-remaining) / 100}% (${-remaining} bps).`
    }
  }

  // Per-recipient rounding to zero check (only when totalAmount is known and bps sum is correct)
  if (totalAmount !== null && totalAmount > 0n && total === BPS_DENOMINATOR) {
    const amounts = computeAmounts(totalAmount, bpsValues)
    for (let i = 0; i < amounts.length; i++) {
      if (amounts[i] === 0n) {
        result.roundingErrors[i] = 'Amount rounds to zero. Increase allocation or total amount.'
      }
    }
  }

  const hasErrors =
    result.nameError !== null ||
    result.amountError !== null ||
    result.recipientsError !== null ||
    result.rowErrors.some(Boolean) ||
    result.allocationError !== null ||
    result.roundingErrors.some(Boolean)

  result.valid = !hasErrors
  return result
}

export function formatAddress(addr: string): string {
  if (addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
