/**
 * On-chain event fetching for ScheduledSplit.
 * Mirrors the structure of history.ts but for ScheduledSplit events.
 */
import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { ACTIVE_NETWORK } from '@/config/networks'

// ---------------------------------------------------------------------------
// Minimal event ABIs (typed for getLogs)
// ---------------------------------------------------------------------------
const SCHEDULE_CREATED_EVENT = parseAbi([
  'event ScheduleCreated(uint256 indexed id, address indexed payer, bytes32 indexed nameHash, string name, uint96 amountPerPayment, uint64[] dueTimes, address[] recipients, uint16[] bps)',
])

const SCHEDULE_EXECUTED_EVENT = parseAbi([
  'event ScheduledPaymentExecuted(uint256 indexed id, uint32 index, address indexed executor, uint64 dueTime, uint256[] amounts)',
])

const SCHEDULE_CANCELLED_EVENT = parseAbi([
  'event ScheduleCancelled(uint256 indexed id, uint256 refund)',
])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ScheduleCreatedEvent {
  id: bigint
  payer: Address
  name: string
  amountPerPayment: bigint
  dueTimes: bigint[]
  recipients: Address[]
  bps: number[]
  blockNumber: bigint
  txHash: `0x${string}`
}

export interface ScheduleExecutedEvent {
  id: bigint
  index: number
  executor: Address
  dueTime: bigint
  amounts: bigint[]
  blockNumber: bigint
  txHash: `0x${string}`
}

export interface ScheduleCancelledEvent {
  id: bigint
  refund: bigint
  blockNumber: bigint
  txHash: `0x${string}`
}

export interface FetchScheduleHistoryResult {
  created: ScheduleCreatedEvent[]
  rpcError: boolean
  /** True when the initial window does not reach the deploy block */
  hasOlder: boolean
  scannedFrom: bigint
  chainHead: bigint
}

// ---------------------------------------------------------------------------
// Public client (mirrors history.ts pattern)
// ---------------------------------------------------------------------------
function makeClient() {
  return createPublicClient({
    transport: http(ACTIVE_NETWORK.rpcUrl, { retryCount: 2, retryDelay: 800 }),
  })
}

const CHUNK = 2_000n
const INITIAL_WINDOW = 50_000n

/**
 * Fetch ScheduleCreated events for a payer, newest-first window.
 */
export async function fetchScheduleHistory(
  contractAddress: Address,
  deployBlock: bigint,
  filterPayer?: Address,
): Promise<FetchScheduleHistoryResult> {
  const client = makeClient()
  let chainHead: bigint
  try {
    chainHead = await client.getBlockNumber()
  } catch {
    return { created: [], rpcError: true, hasOlder: false, scannedFrom: 0n, chainHead: 0n }
  }

  const windowStart = chainHead > INITIAL_WINDOW ? chainHead - INITIAL_WINDOW : deployBlock
  const from = windowStart > deployBlock ? windowStart : deployBlock

  try {
    const logs = await client.getLogs({
      address: contractAddress,
      event: SCHEDULE_CREATED_EVENT[0],
      args: filterPayer ? { payer: filterPayer } : undefined,
      fromBlock: from,
      toBlock: chainHead,
    })
    const created: ScheduleCreatedEvent[] = logs
      .reverse()
      .map((log) => ({
        id: log.args.id!,
        payer: log.args.payer!,
        name: log.args.name!,
        amountPerPayment: BigInt(log.args.amountPerPayment!),
        dueTimes: (log.args.dueTimes ?? []).map(BigInt),
        recipients: (log.args.recipients ?? []) as Address[],
        bps: (log.args.bps ?? []).map(Number),
        blockNumber: log.blockNumber ?? 0n,
        txHash: log.transactionHash,
      }))
    return {
      created,
      rpcError: false,
      hasOlder: from > deployBlock,
      scannedFrom: from,
      chainHead,
    }
  } catch {
    return { created: [], rpcError: true, hasOlder: false, scannedFrom: from, chainHead }
  }
}

/**
 * Fetch executed payments for a schedule id.
 */
export async function fetchExecutedEvents(
  contractAddress: Address,
  deployBlock: bigint,
  scheduleId: bigint,
): Promise<ScheduleExecutedEvent[]> {
  const client = makeClient()
  let chainHead: bigint
  try { chainHead = await client.getBlockNumber() }
  catch { return [] }

  try {
    const logs = await client.getLogs({
      address: contractAddress,
      event: SCHEDULE_EXECUTED_EVENT[0],
      args: { id: scheduleId },
      fromBlock: deployBlock,
      toBlock: chainHead,
    })
    return logs.map((log) => ({
      id: log.args.id!,
      index: Number(log.args.index ?? 0),
      executor: log.args.executor!,
      dueTime: BigInt(log.args.dueTime ?? 0),
      amounts: (log.args.amounts ?? []).map(BigInt),
      blockNumber: log.blockNumber ?? 0n,
      txHash: log.transactionHash,
    }))
  } catch { return [] }
}

/**
 * Fetch the ScheduleCreated event for a single id (used by /s/:id page).
 */
export async function fetchScheduleById(
  contractAddress: Address,
  deployBlock: bigint,
  scheduleId: bigint,
): Promise<{ event: ScheduleCreatedEvent | null; rpcError: boolean }> {
  const client = makeClient()
  let chainHead: bigint
  try { chainHead = await client.getBlockNumber() }
  catch { return { event: null, rpcError: true } }

  try {
    // Scan in chunks from deploy block forward
    let from = deployBlock
    while (from <= chainHead) {
      const to = from + CHUNK > chainHead ? chainHead : from + CHUNK
      const logs = await client.getLogs({
        address: contractAddress,
        event: SCHEDULE_CREATED_EVENT[0],
        args: { id: scheduleId },
        fromBlock: from,
        toBlock: to,
      })
      if (logs.length > 0) {
        const log = logs[0]
        return {
          event: {
            id: log.args.id!,
            payer: log.args.payer!,
            name: log.args.name!,
            amountPerPayment: BigInt(log.args.amountPerPayment!),
            dueTimes: (log.args.dueTimes ?? []).map(BigInt),
            recipients: (log.args.recipients ?? []) as Address[],
            bps: (log.args.bps ?? []).map(Number),
            blockNumber: log.blockNumber ?? 0n,
            txHash: log.transactionHash,
          },
          rpcError: false,
        }
      }
      if (to >= chainHead) break
      from = to + 1n
    }
    return { event: null, rpcError: false }
  } catch {
    return { event: null, rpcError: true }
  }
}

/**
 * Fetch the ScheduleCancelled event for a schedule id (if any).
 */
export async function fetchCancelledEvent(
  contractAddress: Address,
  deployBlock: bigint,
  scheduleId: bigint,
): Promise<ScheduleCancelledEvent | null> {
  const client = makeClient()
  let chainHead: bigint
  try { chainHead = await client.getBlockNumber() }
  catch { return null }

  try {
    const logs = await client.getLogs({
      address: contractAddress,
      event: SCHEDULE_CANCELLED_EVENT[0],
      args: { id: scheduleId },
      fromBlock: deployBlock,
      toBlock: chainHead,
    })
    if (logs.length === 0) return null
    const log = logs[0]
    return {
      id: log.args.id!,
      refund: BigInt(log.args.refund ?? 0),
      blockNumber: log.blockNumber ?? 0n,
      txHash: log.transactionHash,
    }
  } catch { return null }
}
