/**
 * Read-only RPC diagnostic for Arc Testnet (run by .github/workflows/rpc-probe.yml).
 * Prints, per endpoint: head block, eth_getLogs success/latency for several range sizes,
 * and a full backwards scan of SplitDistributor `Distributed` events (count + time).
 */
import { createPublicClient, http, parseAbiItem } from 'viem'

const ENDPOINTS = [
  'https://rpc.testnet.arc.io',
  'https://rpc.testnet.arc.network',
  'https://rpc.blockdaemon.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
]
const DISTRIBUTOR = '0x43a159af83f4c836940e2e74c8a29ae677c39498' as const
const DEPLOY_BLOCK = 69249404n
const EVENT = parseAbiItem(
  'event Distributed(uint256 indexed distributionId, address indexed payer, bytes32 indexed nameHash, string name, uint256 totalAmount, address[] recipients, uint16[] bps, uint256[] amounts)',
)
const COUNT_ABI = [{ type: 'function', name: 'distributionCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const

const short = (e: unknown) => String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? e).split('\n')[0].slice(0, 140)

for (const url of ENDPOINTS) {
  const c = createPublicClient({ transport: http(url, { timeout: 15_000, retryCount: 0 }) })
  console.log(`\n=== ${url}`)
  let head: bigint
  try {
    const t = Date.now(); head = await c.getBlockNumber(); console.log(`head ${head} (${Date.now() - t} ms)`)
  } catch (e) { console.log(`getBlockNumber FAILED: ${short(e)}`); continue }
  try {
    const n = await c.readContract({ address: DISTRIBUTOR, abi: COUNT_ABI, functionName: 'distributionCount' })
    console.log(`distributionCount ${n}`)
  } catch (e) { console.log(`distributionCount FAILED: ${short(e)}`) }
  for (const size of [1_000n, 2_000n, 5_000n, 10_000n, 50_000n, 100_000n, 500_000n]) {
    const t = Date.now()
    try {
      const logs = await c.getLogs({ address: DISTRIBUTOR, event: EVENT, fromBlock: head - size + 1n, toBlock: head })
      console.log(`getLogs ${size} blocks: OK ${logs.length} logs (${Date.now() - t} ms)`)
    } catch (e) { console.log(`getLogs ${size} blocks: FAILED (${Date.now() - t} ms) ${short(e)}`) }
  }
}

// Full scan exactly like the app (2,000-block chunks, 8 in parallel) on the first endpoint
const c = createPublicClient({ transport: http(ENDPOINTS[0], { timeout: 15_000, retryCount: 1 }) })
const head = await c.getBlockNumber()
const t0 = Date.now(); let hi = head; let found = 0; let failed = 0; let chunks = 0
while (hi >= DEPLOY_BLOCK) {
  const ranges: [bigint, bigint][] = []
  for (let i = 0; i < 8 && hi >= DEPLOY_BLOCK; i++) { const lo = hi - 1999n > DEPLOY_BLOCK ? hi - 1999n : DEPLOY_BLOCK; ranges.push([lo, hi]); hi = lo - 1n }
  const res = await Promise.all(ranges.map(([a, b]) => c.getLogs({ address: DISTRIBUTOR, event: EVENT, fromBlock: a, toBlock: b }).catch(() => null)))
  chunks += ranges.length
  for (const r of res) { if (r === null) failed++; else found += r.length }
}
console.log(`\nFULL SCAN (2k chunks x8): ${chunks} chunks, ${found} events, ${failed} failed chunks, ${Date.now() - t0} ms, blocks ${head - DEPLOY_BLOCK}`)
