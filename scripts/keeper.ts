/**
 * Keeper bot for ScheduledSplit.
 *
 * Discovery:  reads scheduleCount() and checks ids 1..count via batched isDue()
 *             (no getLogs scan — avoids unbounded range growth on Arc's fast blocks).
 * Safety cap: at most MAX_EXECUTES_PER_RUN executes per run.
 * Errors:     a failed isDue read is reported, not silently ignored.
 *             simulate or send failures skip that id for this run (no retry).
 *             Receipt status is checked; a reverted tx is a failure.
 * Secrets:    URLs are redacted from every logged message; the private key and
 *             account address are never logged.
 * Dry run:    DRY_RUN=true → discover + simulate but send nothing.
 * RPC:        RPC_URL → testnet/mainnet defaults (with fallback list).
 * Validation: SPLIT_NETWORK must be "testnet"|"mainnet"; eth_chainId is
 *             verified against the expected chain before any transaction.
 *
 * Required env:
 *   KEEPER_PRIVATE_KEY           — hex private key (never logged)
 *   SCHEDULED_SPLIT_ADDRESS      — deployed contract address
 *
 * Optional env:
 *   SPLIT_NETWORK                — "testnet" | "mainnet" (default: "testnet")
 *   RPC_URL                      — override; may contain an API key (secret)
 *   DRY_RUN                      — "true" to simulate only, send nothing
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  fallback,
  parseAbi,
  defineChain,
  type Address,
  type PublicClient,
  type WalletClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import {
  safeErrorMessage,
  buildRpcList,
  parseNetwork,
  EXPECTED_CHAIN_ID,
  batchedSettle,
  type KeeperNetwork,
} from './keeper-utils.ts'

// ---------------------------------------------------------------------------
// Safety cap
// ---------------------------------------------------------------------------
const MAX_EXECUTES_PER_RUN = 100

// ---------------------------------------------------------------------------
// Env parsing (validate before creating clients)
// ---------------------------------------------------------------------------

let NETWORK: KeeperNetwork
try {
  NETWORK = parseNetwork(process.env.SPLIT_NETWORK)
} catch (err) {
  console.error(`[keeper] Config error: ${safeErrorMessage(err)}`)
  process.exit(1)
}

const CONTRACT_ADDRESS = (process.env.SCHEDULED_SPLIT_ADDRESS ?? '').trim() as Address
if (!CONTRACT_ADDRESS || !/^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS)) {
  console.error('[keeper] SCHEDULED_SPLIT_ADDRESS is missing or invalid.')
  process.exit(1)
}

const PRIVATE_KEY_RAW = (process.env.KEEPER_PRIVATE_KEY ?? '').trim()
if (!PRIVATE_KEY_RAW) {
  console.error('[keeper] KEEPER_PRIVATE_KEY is not set.')
  process.exit(1)
}

const DRY_RUN = (process.env.DRY_RUN ?? '').trim().toLowerCase() === 'true'

// RPC_URL may contain an API key — never log it
const rpcOverride = process.env.RPC_URL?.trim() || undefined
const rpcList = buildRpcList(NETWORK, rpcOverride)

// ---------------------------------------------------------------------------
// Chain definitions (no hardcoded addresses — only ids, names, rpcs)
// ---------------------------------------------------------------------------
const ARC_TESTNET = defineChain({
  id: EXPECTED_CHAIN_ID.testnet,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpcList[0]] } },
})

const ARC_MAINNET = defineChain({
  id: EXPECTED_CHAIN_ID.mainnet,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpcList[0]] } },
})

const chain = NETWORK === 'mainnet' ? ARC_MAINNET : ARC_TESTNET

// ---------------------------------------------------------------------------
// Minimal ABI — only what the keeper needs
// ---------------------------------------------------------------------------
const KEEPER_ABI = parseAbi([
  'function scheduleCount() external view returns (uint256)',
  'function isDue(uint256 id) external view returns (bool)',
  'function execute(uint256 id) external',
])

// ---------------------------------------------------------------------------
// Clients (private key never logged — account.address is public and safe)
// ---------------------------------------------------------------------------
const account = privateKeyToAccount(
  (PRIVATE_KEY_RAW.startsWith('0x') ? PRIVATE_KEY_RAW : `0x${PRIVATE_KEY_RAW}`) as `0x${string}`
)

const transport = fallback(
  rpcList.map((url, i) =>
    http(url, { retryCount: i === 0 ? 3 : 2, retryDelay: 1000 })
  )
)

const publicClient: PublicClient = createPublicClient({ chain, transport })
const walletClient: WalletClient = createWalletClient({ chain, transport, account })

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all schedule ids that currently report isDue() = true.
 * Uses bounded concurrency (~10 parallel reads — no multicall needed on Arc).
 * A failed read is reported to stderr and counted as "not due" for safety.
 *
 * @param count  Total number of schedules (from scheduleCount())
 * @returns      { dueIds, readErrors }
 */
async function findDueIds(count: bigint): Promise<{ dueIds: bigint[]; readErrors: number }> {
  if (count === 0n) return { dueIds: [], readErrors: 0 }

  const ids: bigint[] = []
  for (let i = 1n; i <= count; i++) ids.push(i)

  const results = await batchedSettle(ids, 10, (id) =>
    publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: KEEPER_ABI,
      functionName: 'isDue',
      args: [id],
    })
  )

  const dueIds: bigint[] = []
  let readErrors = 0
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    if (r.ok) {
      if (r.value) dueIds.push(ids[i])
    } else {
      readErrors++
      console.error(
        `[keeper] isDue(${ids[i]}) failed: ${safeErrorMessage(r.error)}`
      )
    }
  }
  return { dueIds, readErrors }
}

/**
 * Simulate and (unless dry-run) execute a single payment.
 * Returns { hash, block } on success, or throws.
 * Never retries — caller skips this id on failure.
 */
async function executeOne(id: bigint): Promise<{ hash: `0x${string}`; block: bigint }> {
  // Simulate first — rejects reverts without spending gas
  await publicClient.simulateContract({
    address: CONTRACT_ADDRESS,
    abi: KEEPER_ABI,
    functionName: 'execute',
    args: [id],
    account: account.address,
  })

  if (DRY_RUN) {
    // Simulation passed — would have sent a tx here
    console.log(`[keeper] DRY_RUN: schedule #${id} simulation passed, tx not sent`)
    return { hash: '0x0000000000000000000000000000000000000000000000000000000000000000', block: 0n }
  }

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: KEEPER_ABI,
    functionName: 'execute',
    args: [id],
    account,
    chain,
  })

  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })
  if (receipt.status !== 'success') {
    throw new Error(`tx reverted (hash: ${hash})`)
  }

  return { hash, block: receipt.blockNumber }
}

// ---------------------------------------------------------------------------
// Chain ID validation — run once before any transaction
// ---------------------------------------------------------------------------
async function assertChainId(): Promise<void> {
  const onchain = await publicClient.getChainId()
  const expected = EXPECTED_CHAIN_ID[NETWORK]
  if (onchain !== expected) {
    throw new Error(
      `Chain ID mismatch: expected ${expected} (${NETWORK}) but RPC returned ${onchain}. ` +
      `Check SPLIT_NETWORK and RPC_URL.`
    )
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  console.log(
    `[keeper] Network: ${NETWORK} | Contract: ${CONTRACT_ADDRESS}` +
    (DRY_RUN ? ' | DRY_RUN=true' : '')
  )
  // Never log the key or the RPC URL (may contain API key)

  // 1. Verify chain ID matches configured network
  try {
    await assertChainId()
  } catch (err) {
    console.error(`[keeper] Chain ID check failed: ${safeErrorMessage(err)}`)
    process.exit(2)
  }

  // 2. Read scheduleCount
  let count: bigint
  try {
    count = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: KEEPER_ABI,
      functionName: 'scheduleCount',
    })
  } catch (err) {
    console.error(`[keeper] Cannot read scheduleCount: ${safeErrorMessage(err)}`)
    process.exit(2)
  }

  console.log(`[keeper] scheduleCount: ${count}`)
  if (count === 0n) {
    console.log('[keeper] No schedules exist. Nothing to do.')
    process.exit(0)
  }

  // 3. Find due ids (bounded concurrency, errors reported)
  let dueIds: bigint[]
  let readErrors: number
  try {
    ;({ dueIds, readErrors } = await findDueIds(count))
  } catch (err) {
    console.error(`[keeper] Error reading isDue: ${safeErrorMessage(err)}`)
    process.exit(2)
  }

  if (readErrors > 0) {
    console.error(`[keeper] ${readErrors} isDue read(s) failed — results may be incomplete`)
  }

  if (dueIds.length === 0) {
    console.log('[keeper] Nothing is due. Exiting.')
    process.exit(0)
  }

  console.log(`[keeper] ${dueIds.length} schedule(s) due: ${dueIds.join(', ')}`)

  // Apply safety cap
  const toExecute = dueIds.slice(0, MAX_EXECUTES_PER_RUN)
  if (toExecute.length < dueIds.length) {
    console.warn(
      `[keeper] Safety cap: executing first ${MAX_EXECUTES_PER_RUN} of ${dueIds.length} due schedules`
    )
  }

  // 4. Execute each — skip on failure, no retry within this run
  let successCount = 0
  let failCount = 0

  for (const id of toExecute) {
    try {
      const { hash, block } = await executeOne(id)
      if (!DRY_RUN) {
        console.log(`[keeper] Executed schedule #${id}: tx ${hash} (block ${block})`)
        successCount++
      }
    } catch (err) {
      // Redact URLs from error messages (RPC URL may contain API key)
      console.error(
        `[keeper] Failed to execute schedule #${id}: ${safeErrorMessage(err)}`
      )
      failCount++
      // No retry — continue to next id
    }
  }

  if (!DRY_RUN) {
    console.log(`[keeper] Done. ${successCount} executed, ${failCount} failed.`)
  } else {
    console.log(`[keeper] Dry run complete. ${toExecute.length} schedule(s) would be executed.`)
  }

  process.exit(failCount > 0 || readErrors > 0 ? 1 : 0)
}

void main()
