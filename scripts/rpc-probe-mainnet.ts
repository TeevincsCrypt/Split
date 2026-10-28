/**
 * Read-only Arc MAINNET diagnostic (run by .github/workflows/rpc-probe.yml).
 * Verifies chain id, that official USDC exists at 0x3600…0000 (code, symbol, decimals),
 * and eth_getLogs range limits per public endpoint. Sends no transactions.
 */
import { createPublicClient, http, parseAbiItem, erc20Abi } from 'viem'

const ENDPOINTS = [
  'https://rpc.mainnet.arc.io',
  'https://rpc.blockdaemon.mainnet.arc.io',
  'https://rpc.drpc.mainnet.arc.io',
  'https://rpc.quicknode.mainnet.arc.io',
]
const USDC = '0x3600000000000000000000000000000000000000' as const
const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const short = (e: unknown) => String((e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? e).split('\n')[0].slice(0, 140)

for (const url of ENDPOINTS) {
  const c = createPublicClient({ transport: http(url, { timeout: 15_000, retryCount: 0 }) })
  console.log(`\n=== ${url}`)
  let head: bigint
  try {
    const [id, h] = await Promise.all([c.getChainId(), c.getBlockNumber()])
    head = h
    console.log(`chainId ${id}  head ${h}`)
  } catch (e) { console.log(`chainId/head FAILED: ${short(e)}`); continue }
  try {
    const code = await c.getCode({ address: USDC })
    const [sym, dec] = await Promise.all([
      c.readContract({ address: USDC, abi: erc20Abi, functionName: 'symbol' }),
      c.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' }),
    ])
    console.log(`USDC code ${code ? code.length / 2 - 1 : 0} bytes, symbol ${sym}, decimals ${dec}`)
  } catch (e) { console.log(`USDC check FAILED: ${short(e)}`) }
  for (const size of [1_000n, 2_000n, 5_000n, 10_000n, 50_000n, 100_000n]) {
    const t = Date.now()
    try {
      const logs = await c.getLogs({ address: USDC, event: TRANSFER, fromBlock: head - size + 1n, toBlock: head })
      console.log(`getLogs ${size}: OK ${logs.length} logs (${Date.now() - t} ms)`)
    } catch (e) { console.log(`getLogs ${size}: FAILED (${Date.now() - t} ms) ${short(e)}`) }
  }
}
