/**
 * Reads Distributed events from the chain via getLogs in chunked ranges.
 * Strategy: newest-first bounded initial window (last INITIAL_WINDOW blocks from head).
 * Callers can extend backwards via `fetchOlderHistory`.
 * Receipt page uses indexed distributionId topic filter for fast single-event lookup.
 */

import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem'
import { arcTestnet } from 'viem/chains'
import { arcMainnet } from '@/config'
import { ACTIVE_NETWORK } from '@/config/networks'
import { SPLIT_DISTRIBUTOR_ABI } from '@/abi/SplitDistributor'

export interface DistributionEvent {
  distributionId: bigint
  payer: string
  nameHash: string
  name: string
  totalAmount: bigint
  recipients: readonly string[]
  bps: readonly number[]
  amounts: readonly bigint[]
  blockNumber: bigint
  transactionHash: string
  timestamp: number | null // unix seconds, null if fetch failed
}

const CHUNK_SIZE = 2_000n
// Default window shown without "Load older" — recent 50,000 blocks (~1–2 days on Arc)
const INITIAL_WINDOW = 50_000n

// Effective RPC URL: VITE_SPLIT_RPC_URL override > Arc Studio proxy > onchain-facts default.
// Resolution happens in networks.ts; ACTIVE_NETWORK.rpcUrl already holds the right value.
export const rpcUrl: string = ACTIVE_NETWORK.rpcUrl

const activeChain = ACTIVE_NETWORK.chainId === 5042 ? arcMainnet : arcTestnet

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(rpcUrl),
})

const distributedEventAbi = parseAbiItem(
  'event Distributed(uint256 indexed distributionId, address indexed payer, bytes32 indexed nameHash, string name, uint256 totalAmount, address[] recipients, uint16[] bps, uint256[] amounts)',
)

export interface FetchHistoryOptions {
  payer?: string
  /** Override fromBlock (for "Load older" — start earlier than the current window) */
  fromBlock?: bigint
  /** Override toBlock (for "Load older" — scan up to this block) */
  toBlock?: bigint
  onProgress?: (loaded: number, total: number) => void
}

export interface FetchHistoryResult {
  events: DistributionEvent[]
  partial: boolean
  /** True when the RPC could not be reached at all (getBlockNumber failed) */
  rpcError: boolean
  /** Oldest block that was scanned in this call */
  scannedFrom: bigint
  /** Head block at time of scan */
  chainHead: bigint
}

async function scanRange(
  contractAddress: `0x${string}`,
  from: bigint,
  to: bigint,
  payer: string | undefined,
  onProgress?: (loaded: number, total: number) => void,
): Promise<{ logs: Awaited<ReturnType<typeof publicClient.getLogs>>; partial: boolean }> {
  const total = to - from + 1n
  let loaded = 0n
  const rawLogs: Awaited<ReturnType<typeof publicClient.getLogs>> = []
  let partial = false

  for (let start = from; start <= to; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n < to ? start + CHUNK_SIZE - 1n : to
    try {
      const logs = await publicClient.getLogs({
        address: contractAddress,
        event: distributedEventAbi,
        fromBlock: start,
        toBlock: end,
        args: payer ? { payer: payer as `0x${string}` } : {},
      })
      rawLogs.push(...logs)
      loaded += end - start + 1n
      onProgress?.(Number(loaded), Number(total))
    } catch {
      partial = true
      break
    }
  }
  return { logs: rawLogs, partial }
}

async function decodeLogs(
  rawLogs: Awaited<ReturnType<typeof publicClient.getLogs>>,
): Promise<DistributionEvent[]> {
  const events: DistributionEvent[] = []
  for (const log of rawLogs) {
    try {
      const decoded = decodeEventLog({
        abi: SPLIT_DISTRIBUTOR_ABI,
        data: log.data,
        topics: log.topics,
        eventName: 'Distributed',
      })
      const args = decoded.args as {
        distributionId: bigint
        payer: string
        nameHash: string
        name: string
        totalAmount: bigint
        recipients: readonly string[]
        bps: readonly number[]
        amounts: readonly bigint[]
      }

      let timestamp: number | null = null
      try {
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber! })
        timestamp = Number(block.timestamp)
      } catch {
        /* non-fatal */
      }

      events.push({
        distributionId: args.distributionId,
        payer: args.payer,
        nameHash: args.nameHash,
        name: args.name,
        totalAmount: args.totalAmount,
        recipients: args.recipients,
        bps: args.bps,
        amounts: args.amounts,
        blockNumber: log.blockNumber!,
        transactionHash: log.transactionHash!,
        timestamp,
      })
    } catch {
      /* skip malformed log */
    }
  }
  // Newest first
  events.sort((a, b) => (b.distributionId > a.distributionId ? 1 : -1))
  return events
}

/**
 * Fetch the most-recent window of Distributed events (newest-first).
 * Starts from max(deployBlock, head - INITIAL_WINDOW) to head.
 */
export async function fetchHistory(opts: FetchHistoryOptions = {}): Promise<FetchHistoryResult> {
  const contractAddress = ACTIVE_NETWORK.distributorAddress
  if (!contractAddress) return { events: [], partial: false, rpcError: false, scannedFrom: 0n, chainHead: 0n }

  let chainHead: bigint
  try {
    chainHead = await publicClient.getBlockNumber()
  } catch {
    return { events: [], partial: false, rpcError: true, scannedFrom: 0n, chainHead: 0n }
  }

  const deployBlock = ACTIVE_NETWORK.deployBlock
  const windowFrom = chainHead > INITIAL_WINDOW ? chainHead - INITIAL_WINDOW : deployBlock
  const from = opts.fromBlock ?? (windowFrom > deployBlock ? windowFrom : deployBlock)
  const to = opts.toBlock ?? chainHead

  const { logs, partial } = await scanRange(contractAddress, from, to, opts.payer, opts.onProgress)
  const events = await decodeLogs(logs)
  return { events, partial, rpcError: false, scannedFrom: from, chainHead }
}

/**
 * Fetch older events — scans from `from` up to `to` (exclusive of already-fetched window).
 * Used by "Load older" button.
 */
export async function fetchOlderHistory(
  upToBlock: bigint,
  payer?: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<FetchHistoryResult> {
  const contractAddress = ACTIVE_NETWORK.distributorAddress
  if (!contractAddress) return { events: [], partial: false, rpcError: false, scannedFrom: 0n, chainHead: upToBlock }

  let chainHead: bigint
  try {
    chainHead = await publicClient.getBlockNumber()
  } catch {
    chainHead = upToBlock
  }

  const deployBlock = ACTIVE_NETWORK.deployBlock
  if (upToBlock <= deployBlock) return { events: [], partial: false, rpcError: false, scannedFrom: deployBlock, chainHead }

  // Scan INITIAL_WINDOW blocks older than the current oldest
  const windowSize = INITIAL_WINDOW
  const to = upToBlock - 1n
  const from = to > windowSize + deployBlock ? to - windowSize : deployBlock

  const { logs, partial } = await scanRange(contractAddress, from, to, payer, onProgress)
  const events = await decodeLogs(logs)
  return { events, partial, rpcError: false, scannedFrom: from, chainHead }
}

export interface FetchEventByIdResult {
  event: DistributionEvent | null
  rpcError: boolean
}

/**
 * Fetch a single distribution by ID using the indexed topic filter.
 * Much faster than a full scan for the Receipt page.
 * Returns { event: null, rpcError: true } when the RPC cannot be reached.
 * Returns { event: null, rpcError: false } when the ID was simply not found.
 */
export async function fetchEventById(
  distributionId: bigint,
): Promise<FetchEventByIdResult> {
  const contractAddress = ACTIVE_NETWORK.distributorAddress
  if (!contractAddress) return { event: null, rpcError: false }

  let chainHead: bigint
  try {
    chainHead = await publicClient.getBlockNumber()
  } catch {
    return { event: null, rpcError: true }
  }

  try {
    const logs = await publicClient.getLogs({
      address: contractAddress,
      event: distributedEventAbi,
      fromBlock: ACTIVE_NETWORK.deployBlock,
      toBlock: chainHead,
      args: { distributionId },
    })
    if (logs.length === 0) return { event: null, rpcError: false }
    const events = await decodeLogs(logs)
    return { event: events[0] ?? null, rpcError: false }
  } catch {
    return { event: null, rpcError: true }
  }
}
