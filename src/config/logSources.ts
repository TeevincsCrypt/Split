/**
 * eth_getLogs sources per chain, with the largest range each accepted when measured
 * by scripts/rpc-probe.ts. No imports so the CI probe can load this file directly.
 */
/**
 * eth_getLogs sources with the largest range each accepted when measured.
 * The scanner halves a range on rejection, so these are upper bounds, not guarantees.
 */
export const LOG_SOURCES: Record<number, { url: string; maxRange: bigint }[]> = {
  [5042002]: [
    { url: 'https://rpc.blockdaemon.testnet.arc.io', maxRange: 50_000n },
    { url: 'https://rpc.testnet.arc.io', maxRange: 10_000n },
    { url: 'https://rpc.quicknode.testnet.arc.io', maxRange: 2_000n },
  ],
  [5042]: [
    { url: 'https://rpc.mainnet.arc.io', maxRange: 10_000n },
  ],
}

/** Log sources for a chain, with the VITE_SPLIT_RPC_URL override (if any) tried first. */
export function logSourcesFor(chainId: number, override?: string): { url: string; maxRange: bigint }[] {
  const base = LOG_SOURCES[chainId] ?? []
  const o = override?.trim()
  return o && o.startsWith('https://') ? [{ url: o, maxRange: 10_000n }, ...base.filter((b) => b.url !== o)] : base
}
