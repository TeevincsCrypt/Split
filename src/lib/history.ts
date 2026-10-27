/**
 * Reads Distributed events from the chain via getLogs in chunked ranges.
 * No backend — the chain is the source of truth.
 */

import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem'
import { arcTestnet } from 'viem/chains'
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

// Use the RPC proxy env if available, else fall back to the chain's default
const proxyBase: string = (import.meta.env.VITE_RPC_PROXY_BASE_URL as string | undefined) ?? ''
const proxyToken: string = (import.meta.env.VITE_RPC_PROXY_TOKEN as string | undefined) ?? ''
const proxyChainsRaw: string = (import.meta.env.VITE_RPC_PROXY_CHAINS as string | undefined) ?? ''
const proxyChains: string[] = proxyChainsRaw.split(',')
const rpcUrl: string =
  proxyBase && proxyChains.includes('Arc_Testnet')
    ? `${proxyBase}/api/rpc/Arc_Testnet?_rpc_token=${proxyToken}`
    : ACTIVE_NETWORK.rpcUrl

const arcChain =
  ACTIVE_NETWORK.chainId === 5042002
    ? arcTestnet
    : { id: ACTIVE_NETWORK.chainId, name: ACTIVE_NETWORK.name, nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [ACTIVE_NETWORK.rpcUrl] } } }

export const publicClient = createPublicClient({
  chain: arcChain,
  transport: http(rpcUrl),
})

const distributedEventAbi = parseAbiItem(
  'event Distributed(uint256 indexed distributionId, address indexed payer, bytes32 indexed nameHash, string name, uint256 totalAmount, address[] recipients, uint16[] bps, uint256[] amounts)',
)

export interface FetchHistoryOptions {
  payer?: string
  onProgress?: (loaded: number, total: number) => void
}

export async function fetchHistory(opts: FetchHistoryOptions = {}): Promise<{
  events: DistributionEvent[]
  partial: boolean
}> {
  const contractAddress = ACTIVE_NETWORK.distributorAddress
  if (!contractAddress) return { events: [], partial: false }

  const fromBlock = ACTIVE_NETWORK.deployBlock
  let toBlock: bigint
  try {
    toBlock = await publicClient.getBlockNumber()
  } catch {
    return { events: [], partial: true }
  }

  const totalBlocks = toBlock - fromBlock
  let loaded = 0n
  const rawLogs: Awaited<ReturnType<typeof publicClient.getLogs>> = []
  let partial = false

  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = start + CHUNK_SIZE - 1n < toBlock ? start + CHUNK_SIZE - 1n : toBlock
    try {
      const logs = await publicClient.getLogs({
        address: contractAddress,
        event: distributedEventAbi,
        fromBlock: start,
        toBlock: end,
      })
      rawLogs.push(...logs)
      loaded += end - start + 1n
      opts.onProgress?.(Number(loaded), Number(totalBlocks))
    } catch {
      partial = true
      break
    }
  }

  // Filter by payer if provided
  const filtered = opts.payer
    ? rawLogs.filter(
        (log) =>
          log.topics[2]?.toLowerCase() ===
          ('0x' + opts.payer!.slice(2).toLowerCase().padStart(64, '0')),
      )
    : rawLogs

  // Decode and fetch timestamps
  const events: DistributionEvent[] = []
  for (const log of filtered) {
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

  events.sort((a, b) => (b.distributionId > a.distributionId ? 1 : -1))
  return { events, partial }
}
