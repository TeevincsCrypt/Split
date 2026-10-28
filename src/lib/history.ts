/**
 * Reads Distributed events from the chain via getLogs in chunked ranges.
 * Strategy: read distributionCount(), then scan backwards from head in parallel
 * 2,000-block chunks until every distribution is found (or the deploy block is reached).
 * `fetchOlderHistory` remains for the rare case where a chunk failed.
 * Receipt page uses indexed distributionId topic filter for fast single-event lookup.
 */

import { createPublicClient, fallback, http, parseAbiItem, decodeEventLog } from 'viem'
import { arcTestnet } from 'viem/chains'
import { arcMainnet } from '@/config'
import { ACTIVE_NETWORK, logSourcesFor } from '@/config/networks'
import { scanLogsBackward, type LogClient, type LogSource } from '@/lib/logScan'
import { SPLIT_DISTRIBUTOR_ABI } from '@/abi/SplitDistributor'
import { SCHEDULED_SPLIT_ABI } from '@/abi/ScheduledSplit'

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
  /** 'instant' = Pay now (SplitDistributor); 'scheduled' = a ScheduledSplit payment */
  kind: 'instant' | 'scheduled'
  /** Unique list key across both kinds */
  key: string
  /** In-app link: /d/:id for instant, /s/:id for scheduled */
  href: string
  scheduleId?: bigint
  /** 1-based payment number within the schedule */
  paymentNumber?: number
  paymentCount?: number
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
  transport: fallback(ACTIVE_NETWORK.rpcUrls.map((url) => http(url, { timeout: 10_000, retryCount: 1 }))),
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

type RawLogs = Awaited<ReturnType<typeof publicClient.getLogs>>

// History reads go to the log sources measured to accept large ranges (see logScan.ts).
const logSources: LogSource[] = logSourcesFor(
  ACTIVE_NETWORK.chainId,
  import.meta.env.VITE_SPLIT_RPC_URL as string | undefined,
).map((s) => ({
  client: createPublicClient({ chain: activeChain, transport: http(s.url, { timeout: 15_000, retryCount: 0 }) }) as unknown as LogClient,
  maxRange: s.maxRange,
}))

/** Scan backwards from `to` to `floor` until `done(logs)`; see scanLogsBackward. */
async function scanBackward(
  contractAddress: `0x${string}`,
  floor: bigint,
  to: bigint,
  args: Record<string, unknown>,
  done: (logs: RawLogs) => boolean,
): Promise<{ logs: RawLogs; partial: boolean; scannedFrom: bigint }> {
  const r = await scanLogsBackward<RawLogs[number]>({
    sources: logSources, address: contractAddress, event: distributedEventAbi, args, floor, to,
    done: (l) => done(l),
  })
  return { logs: r.logs, partial: r.partial, scannedFrom: r.scannedFrom }
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
        kind: 'instant',
        key: `d-${args.distributionId}`,
        href: `/d/${args.distributionId}`,
      })
    } catch {
      /* skip malformed log */
    }
  }
  // Newest first
  events.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0))
  return events
}

const scheduledExecutedEvent = parseAbiItem(
  'event ScheduledPaymentExecuted(uint256 indexed id, uint32 index, address indexed executor, uint64 dueTime, uint256[] amounts)',
)

/**
 * Executed ScheduledSplit payments as feed entries. Payer, name and recipients come
 * from getSchedule(id) (one read per schedule). Returns [] when scheduling is not configured.
 */
async function fetchScheduledPayouts(head: bigint, payer?: string): Promise<{ events: DistributionEvent[]; partial: boolean }> {
  const address = ACTIVE_NETWORK.scheduledSplitAddress
  if (!address) return { events: [], partial: false }
  type ExecLog = {
    args: { id?: bigint; index?: number; amounts?: readonly bigint[] }
    blockNumber: bigint | null
    transactionHash: `0x${string}` | null
  }
  const { logs, partial } = await scanLogsBackward<ExecLog>({
    sources: logSources, address, event: scheduledExecutedEvent,
    floor: ACTIVE_NETWORK.scheduledSplitDeployBlock, to: head,
  })

  const ids = [...new Set(logs.map((l) => l.args.id).filter((x): x is bigint => x !== undefined))]
  const schedules = new Map<bigint, { payer: string; name: string; recipients: readonly string[]; bps: readonly number[]; count: number }>()
  await Promise.all(ids.map(async (id) => {
    try {
      const sch = await publicClient.readContract({ address, abi: SCHEDULED_SPLIT_ABI, functionName: 'getSchedule', args: [id] })
      schedules.set(id, { payer: sch.payer, name: sch.name, recipients: sch.recipients, bps: sch.bps, count: sch.dueTimes.length })
    } catch { /* skipped below; counted as partial */ }
  }))

  const events: DistributionEvent[] = []
  let missing = false
  for (const log of logs) {
    const id = log.args.id
    const sch = id !== undefined ? schedules.get(id) : undefined
    if (id === undefined || !sch || log.blockNumber === null || !log.transactionHash) { missing = true; continue }
    if (payer && sch.payer.toLowerCase() !== payer.toLowerCase()) continue
    let timestamp: number | null = null
    try { timestamp = Number((await publicClient.getBlock({ blockNumber: log.blockNumber })).timestamp) } catch { /* non-fatal */ }
    const amounts = log.args.amounts ?? []
    const n = Number(log.args.index ?? 0) + 1
    events.push({
      distributionId: id,
      payer: sch.payer,
      nameHash: '',
      name: sch.name,
      totalAmount: amounts.reduce((a, b) => a + b, 0n),
      recipients: sch.recipients,
      bps: sch.bps,
      amounts,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      timestamp,
      kind: 'scheduled',
      key: `s-${id}-${n}`,
      href: `/s/${id}`,
      scheduleId: id,
      paymentNumber: n,
      paymentCount: sch.count,
    })
  }
  return { events, partial: partial || missing }
}

const byNewest = (a: DistributionEvent, b: DistributionEvent) =>
  b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0

/**
 * Fetch the most-recent window of Distributed events (newest-first).
 * Starts from max(deployBlock, head - INITIAL_WINDOW) to head.
 */
export async function fetchHistory(opts: FetchHistoryOptions = {}): Promise<FetchHistoryResult> {
  const contractAddress = ACTIVE_NETWORK.distributorAddress
  if (!contractAddress) return { events: [], partial: false, rpcError: false, scannedFrom: 0n, chainHead: 0n }

  let chainHead: bigint
  let total: bigint
  try {
    ;[chainHead, total] = await Promise.all([
      publicClient.getBlockNumber(),
      publicClient.readContract({ address: contractAddress, abi: SPLIT_DISTRIBUTOR_ABI, functionName: 'distributionCount' }),
    ])
  } catch {
    return { events: [], partial: false, rpcError: true, scannedFrom: 0n, chainHead: 0n }
  }

  const deployBlock = ACTIVE_NETWORK.deployBlock
  const to = opts.toBlock ?? chainHead

  // Pay-now distributions: scan all payers so we can stop once every one is found.
  const instantP = total === 0n
    ? Promise.resolve({ events: [] as DistributionEvent[], partial: false, scannedFrom: deployBlock })
    : scanBackward(contractAddress, deployBlock, to, {}, (found) => BigInt(found.length) >= total).then(async (r) => {
        const wanted = opts.payer
          ? r.logs.filter((l) => (l as { args?: { payer?: string } }).args?.payer?.toLowerCase() === opts.payer!.toLowerCase())
          : r.logs
        return { events: await decodeLogs(wanted), partial: r.partial, scannedFrom: r.scannedFrom }
      })
  // Scheduled payments (ScheduledSplit), when configured.
  const scheduledP = fetchScheduledPayouts(to, opts.payer).catch(() => ({ events: [] as DistributionEvent[], partial: true }))

  const [instant, scheduled] = await Promise.all([instantP, scheduledP])
  const events = [...instant.events, ...scheduled.events].sort(byNewest)
  const partial = instant.partial || scheduled.partial
  return { events, partial, rpcError: false, scannedFrom: instant.partial ? instant.scannedFrom : deployBlock, chainHead }
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

  const { logs, partial } = await scanBackward(
    contractAddress, ACTIVE_NETWORK.deployBlock, chainHead, { distributionId }, (found) => found.length > 0,
  )
  if (logs.length === 0) return { event: null, rpcError: partial }
  const events = await decodeLogs(logs)
  return { event: events[0] ?? null, rpcError: false }
}
