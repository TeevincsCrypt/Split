/**
 * On-chain data fetching for ScheduledSplit.
 *
 * Strategy (fixes RPC "range too large" failures):
 *
 * SCHEDULE LIST:  scheduleCount() + getSchedule(id) contract reads via wagmi
 *                 publicClient — NO getLogs for the list at all.
 *
 * EVENT HISTORY:  getLogs in 2,000-block chunks newest-first, indexed by `id`,
 *                 non-fatal: callers show live state even when this fails.
 *
 * Both layers use viem fallback() over ACTIVE_NETWORK.rpcUrls, matching
 * src/lib/history.ts.
 */
import {
  createPublicClient,
  fallback,
  http,
  parseAbi,
  type Address,
  type PublicClient,
} from 'viem'
import { arcTestnet } from 'viem/chains'
import { arcMainnet } from '@/config'
import { ACTIVE_NETWORK, logSourcesFor } from '@/config/networks'
import { scanLogsBackward, type LogClient, type LogSource } from '@/lib/logScan'
import { SCHEDULED_SPLIT_ABI } from '@/abi/ScheduledSplit'
import { BaseError } from 'viem'

// ---------------------------------------------------------------------------
// Shared public client with fallback transport — mirrors history.ts
// ---------------------------------------------------------------------------
const _activeChain = ACTIVE_NETWORK.chainId === 5042 ? arcMainnet : arcTestnet

export const schedulePublicClient: PublicClient = createPublicClient({
  chain: _activeChain,
  transport: fallback(
    ACTIVE_NETWORK.rpcUrls.map((url) => http(url, { timeout: 10_000, retryCount: 1 })),
  ),
})

// ---------------------------------------------------------------------------
// Minimal event ABIs (only for getLogs — the list path uses readContract)
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
  txHash: `0x${string}` | null
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

// ---------------------------------------------------------------------------
// scheduleCount() — used by useScheduleHistory to enumerate ids
// ---------------------------------------------------------------------------
export async function fetchScheduleCount(
  contractAddress: Address,
): Promise<{ count: bigint; rpcError: boolean; errorDetail: string | null }> {
  try {
    const count = await schedulePublicClient.readContract({
      address: contractAddress,
      abi: SCHEDULED_SPLIT_ABI,
      functionName: 'scheduleCount',
    })
    return { count, rpcError: false, errorDetail: null }
  } catch (err) {
    // Distinguish "nothing deployed at this address" from "RPC unreachable"
    let detail = err instanceof BaseError ? err.shortMessage : String(err).slice(0, 160)
    try {
      const code = await schedulePublicClient.getCode({ address: contractAddress })
      if (!code || code === '0x') {
        detail = `No ScheduledSplit contract at ${contractAddress} on ${ACTIVE_NETWORK.name}. Check VITE_SCHEDULED_SPLIT_ADDRESS.`
      }
    } catch { /* keep the original detail */ }
    return { count: 0n, rpcError: true, errorDetail: detail }
  }
}

// ---------------------------------------------------------------------------
// fetchScheduleState — reads getSchedule + nextDueTime + remainingDeposit for one id
// ---------------------------------------------------------------------------

export interface ScheduleState {
  id: bigint
  payer: Address
  name: string
  amountPerPayment: bigint
  dueTimes: bigint[]
  recipients: Address[]
  bps: number[]
  executed: number
  cancelled: boolean
  nextDueTime: bigint
  remainingDeposit: bigint
}

/**
 * Read live state for one schedule directly from the contract.
 * Returns null on error so the caller can show a per-card error.
 */
export async function fetchScheduleState(
  contractAddress: Address,
  id: bigint,
): Promise<ScheduleState | null> {
  try {
    const [raw, ndt, rd] = await Promise.all([
      schedulePublicClient.readContract({
        address: contractAddress,
        abi: SCHEDULED_SPLIT_ABI,
        functionName: 'getSchedule',
        args: [id],
      }),
      schedulePublicClient.readContract({
        address: contractAddress,
        abi: SCHEDULED_SPLIT_ABI,
        functionName: 'nextDueTime',
        args: [id],
      }),
      schedulePublicClient.readContract({
        address: contractAddress,
        abi: SCHEDULED_SPLIT_ABI,
        functionName: 'remainingDeposit',
        args: [id],
      }),
    ])

    // getSchedule returns one struct: (payer, amountPerPayment, dueTimes, executed, cancelled, recipients, bps, name)
    const s = raw

    return {
      id,
      payer: s.payer,
      name: s.name,
      amountPerPayment: BigInt(s.amountPerPayment),
      dueTimes: [...s.dueTimes].map(BigInt),
      recipients: [...s.recipients] as Address[],
      bps: [...s.bps].map(Number),
      executed: Number(s.executed),
      cancelled: s.cancelled,
      nextDueTime: BigInt(ndt),
      remainingDeposit: BigInt(rd),
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Event history — non-fatal chunked getLogs, newest-first, 2,000 blocks/chunk
// ---------------------------------------------------------------------------
const CHUNK = 2_000n

// Event history goes to the log sources measured to accept large ranges (see logScan.ts).
const logSources: LogSource[] = logSourcesFor(
  ACTIVE_NETWORK.chainId,
  import.meta.env.VITE_SPLIT_RPC_URL as string | undefined,
).map((src) => ({
  client: createPublicClient({ chain: _activeChain, transport: http(src.url, { timeout: 15_000, retryCount: 0 }) }) as unknown as LogClient,
  maxRange: src.maxRange,
}))

/**
 * Fetch executed payment events for a schedule id, newest-first, 2k-block chunks.
 * Never throws — returns [] on any error.
 */
export async function fetchExecutedEvents(
  contractAddress: Address,
  deployBlock: bigint,
  scheduleId: bigint,
): Promise<ScheduleExecutedEvent[]> {
  let head: bigint
  try { head = await schedulePublicClient.getBlockNumber() }
  catch { return [] }

  type ExecLog = { args: { id?: bigint; index?: number; executor?: Address; dueTime?: bigint; amounts?: readonly bigint[] }; blockNumber: bigint | null; transactionHash: `0x${string}` }
  const { logs } = await scanLogsBackward<ExecLog>({
    sources: logSources, address: contractAddress, event: SCHEDULE_EXECUTED_EVENT[0],
    args: { id: scheduleId }, floor: deployBlock, to: head,
  })
  const results: ScheduleExecutedEvent[] = logs.map((log) => ({
    id: log.args.id!,
    index: Number(log.args.index ?? 0),
    executor: log.args.executor!,
    dueTime: BigInt(log.args.dueTime ?? 0),
    amounts: (log.args.amounts ?? []).map(BigInt),
    blockNumber: log.blockNumber ?? 0n,
    txHash: log.transactionHash,
  }))
  results.sort((x, y) => y.index - x.index)
  return results
}

/**
 * Fetch the ScheduleCancelled event for a schedule id (if any), chunked.
 * Never throws — returns null on any error.
 */
export async function fetchCancelledEvent(
  contractAddress: Address,
  deployBlock: bigint,
  scheduleId: bigint,
): Promise<ScheduleCancelledEvent | null> {
  let head: bigint
  try { head = await schedulePublicClient.getBlockNumber() }
  catch { return null }

  type CancelLog = { args: { id?: bigint; refund?: bigint }; blockNumber: bigint | null; transactionHash: `0x${string}` }
  const { logs } = await scanLogsBackward<CancelLog>({
    sources: logSources, address: contractAddress, event: SCHEDULE_CANCELLED_EVENT[0],
    args: { id: scheduleId }, floor: deployBlock, to: head, done: (l) => l.length > 0,
  })
  if (logs.length > 0) {
    const log = logs[0]
    return { id: log.args.id!, refund: BigInt(log.args.refund ?? 0), blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash }
  }
  return null
}

/**
 * Fetch ScheduleCreated event for a single id via chunked getLogs.
 * Used by /s/:id to get creation metadata (name, recipients, dueTimes).
 * Returns null event (non-fatal) if not found or RPC fails.
 */
export async function fetchScheduleById(
  contractAddress: Address,
  deployBlock: bigint,
  scheduleId: bigint,
): Promise<{ event: ScheduleCreatedEvent | null; rpcError: boolean }> {
  // First try: read directly from contract (much faster, no getLogs)
  const state = await fetchScheduleState(contractAddress, scheduleId)
  if (state) {
    return {
      event: {
        id: state.id,
        payer: state.payer,
        name: state.name,
        amountPerPayment: state.amountPerPayment,
        dueTimes: state.dueTimes,
        recipients: state.recipients,
        bps: state.bps,
        blockNumber: 0n,  // not available from readContract
        txHash: null,
      },
      rpcError: false,
    }
  }

  // State read failed — try getLogs as fallback (slower but gives txHash)
  let head: bigint
  try { head = await schedulePublicClient.getBlockNumber() }
  catch { return { event: null, rpcError: true } }

  let to = head
  while (to >= deployBlock) {
    const from = to > CHUNK ? to - CHUNK : deployBlock
    try {
      const logs = await schedulePublicClient.getLogs({
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
    } catch { /* chunk failed */ }
    if (from <= deployBlock) break
    to = from - 1n
  }
  return { event: null, rpcError: false }
}
