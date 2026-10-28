/**
 * Read-only check of Arc MAINNET transactions (run by .github/workflows/verify-mainnet.yml).
 * For each hash in TX_HASHES (space/comma separated) it prints the receipt. For a contract
 * deployment it also checks that the creation code is the embedded Arc Studio artifact, that
 * the constructor argument is official USDC, and reads the new contract back. For a call it
 * decodes Split events. For each address in CONTRACTS it compares the runtime code with the
 * artifact (only the immutable USDC address may differ), reads it back, and binary-searches
 * the block it was deployed in. Sends no transactions and uses no keys.
 */
import { createPublicClient, http, fallback, decodeEventLog, isHex, getAddress, type Hex } from 'viem'
import { SPLIT_DISTRIBUTOR_ABI_JSON as SD_ABI, SPLIT_DISTRIBUTOR_BYTECODE as SD_CODE, SPLIT_DISTRIBUTOR_DEPLOYED_BYTECODE as SD_RUNTIME } from '../src/abi/SplitDistributorArtifact'
import { SCHEDULED_SPLIT_ABI_JSON as SS_ABI, SCHEDULED_SPLIT_BYTECODE as SS_CODE, SCHEDULED_SPLIT_DEPLOYED_BYTECODE as SS_RUNTIME } from '../src/abi/ScheduledSplitArtifact'

const USDC = '0x3600000000000000000000000000000000000000'
const client = createPublicClient({
  transport: fallback(
    ['https://rpc.blockdaemon.mainnet.arc.io', 'https://rpc.mainnet.arc.io', 'https://rpc.quicknode.mainnet.arc.io']
      .map((u) => http(u, { timeout: 20_000, retryCount: 1 })),
  ),
})
const fmt = (v: unknown): string =>
  typeof v === 'bigint' ? v.toString() : Array.isArray(v) ? `[${v.map(fmt).join(', ')}]` : String(v)

const id = await client.getChainId()
console.log(`chainId ${id}`)
if (id !== 5042) throw new Error('not Arc mainnet')

const hashes = (process.env.TX_HASHES ?? '').split(/[\s,]+/).filter(Boolean)
for (const raw of hashes) {
  console.log(`\n=== ${raw}`)
  if (!isHex(raw) || raw.length !== 66) { console.log('not a tx hash'); continue }
  const hash = raw as Hex
  try {
    const [tx, rc] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })])
    const block = await client.getBlock({ blockNumber: rc.blockNumber })
    console.log(`status ${rc.status}  block ${rc.blockNumber}  time ${new Date(Number(block.timestamp) * 1000).toISOString()}`)
    console.log(`from ${tx.from}  to ${tx.to ?? '(contract creation)'}  gasUsed ${rc.gasUsed}`)
    if (rc.contractAddress) {
      const addr = rc.contractAddress
      const kind = tx.input.startsWith(SD_CODE) ? 'SplitDistributor' : tx.input.startsWith(SS_CODE) ? 'ScheduledSplit' : null
      console.log(`contract ${getAddress(addr)}`)
      console.log(`creation code matches artifact: ${kind ?? 'NO MATCH'}`)
      if (!kind) continue
      const arg = '0x' + tx.input.slice((kind === 'SplitDistributor' ? SD_CODE : SS_CODE).length).slice(-40)
      console.log(`constructor usdc_ ${getAddress(arg)}  official: ${arg.toLowerCase() === USDC}`)
      const abi = kind === 'SplitDistributor' ? SD_ABI : SS_ABI
      const counter = kind === 'SplitDistributor' ? 'distributionCount' : 'scheduleCount'
      for (const fn of ['usdc', 'MAX_RECIPIENTS', counter]) {
        try { console.log(`${fn}() = ${fmt(await client.readContract({ address: addr, abi, functionName: fn as never }))}`) }
        catch (e) { console.log(`${fn}() FAILED ${(e as Error).message.split('\n')[0]}`) }
      }
    }
    for (const log of rc.logs) {
      for (const abi of [SD_ABI, SS_ABI]) {
        try {
          const d = decodeEventLog({ abi, data: log.data, topics: log.topics })
          if (d.eventName === 'OwnershipTransferred') break
          console.log(`event ${d.eventName} @${log.address} ${Object.entries(d.args ?? {}).map(([k, v]) => `${k}=${fmt(v)}`).join(' ')}`)
          break
        } catch { /* not this ABI */ }
      }
    }
  } catch (e) { console.log(`FAILED ${(e as Error).message.split('\n')[0]}`) }
}

/** Runtime code equals the artifact except inside immutable slots, which hold the USDC address. */
function runtimeMatches(onchain: string, artifact: string): boolean {
  if (onchain.length !== artifact.length) return false
  const usdcByte = '36'
  for (let i = 2; i < onchain.length; i += 2) {
    const a = artifact.slice(i, i + 2), b = onchain.slice(i, i + 2).toLowerCase()
    if (a !== b && !(a === '00' && b === usdcByte)) return false
  }
  return true
}

const addrs = (process.env.CONTRACTS ?? '').split(/[\s,]+/).filter(Boolean)
const head = await client.getBlockNumber()
for (const raw of addrs) {
  console.log(`\n=== contract ${raw}`)
  try {
    const addr = getAddress(raw)
    const code = (await client.getCode({ address: addr })) ?? '0x'
    const kind = runtimeMatches(code, SD_RUNTIME) ? 'SplitDistributor' : runtimeMatches(code, SS_RUNTIME) ? 'ScheduledSplit' : null
    console.log(`runtime code ${code.length / 2 - 1} bytes, matches artifact: ${kind ?? 'NO MATCH'}`)
    if (!kind) continue
    const abi = kind === 'SplitDistributor' ? SD_ABI : SS_ABI
    const counter = kind === 'SplitDistributor' ? 'distributionCount' : 'scheduleCount'
    for (const fn of ['usdc', 'MAX_RECIPIENTS', counter]) {
      console.log(`${fn}() = ${fmt(await client.readContract({ address: addr, abi, functionName: fn as never }))}`)
    }
    let lo = 0n, hi = head
    while (lo < hi) {
      const mid = (lo + hi) / 2n
      const c = await client.getCode({ address: addr, blockNumber: mid })
      if (c && c !== '0x') hi = mid; else lo = mid + 1n
    }
    console.log(`deploy block ${lo}`)
  } catch (e) { console.log(`FAILED ${(e as Error).message.split('\n')[0]}`) }
}
