/**
 * Pure, side-effect-free helpers for the keeper bot.
 * Imported by both keeper.ts and the vitest test suite.
 * No env reads, no network calls, no private keys.
 */

// ---------------------------------------------------------------------------
// URL redaction
// ---------------------------------------------------------------------------

/**
 * Redact any URL-like substring (scheme://host/path?query) from a string.
 * Replaces with scheme://[redacted] to show something went there without
 * leaking a provider API key that may be embedded in the path or query.
 */
export function redactUrls(message: string): string {
  return message.replace(/https?:\/\/[^\s"')]+/gi, (match) => {
    try {
      const u = new URL(match)
      return `${u.protocol}//[redacted]`
    } catch {
      return '[redacted-url]'
    }
  })
}

/** Format a viem-style error for safe logging (shortMessage, no URLs). */
export function safeErrorMessage(err: unknown): string {
  if (err == null) return 'unknown error'
  // viem BaseError exposes shortMessage; fall back to message, then toString
  const raw =
    (err as { shortMessage?: string }).shortMessage ??
    (err as Error).message ??
    String(err)
  return redactUrls(raw)
}

// ---------------------------------------------------------------------------
// Network / RPC helpers
// ---------------------------------------------------------------------------

export type KeeperNetwork = 'testnet' | 'mainnet'

export interface NetworkConfig {
  chainId: number
  name: string
  /** Ordered list of RPC URLs to try (first wins via viem fallback transport). */
  rpcUrls: string[]
}

const TESTNET_RPCS = [
  'https://rpc.testnet.arc.io',
  'https://rpc.testnet.arc.network',
]
const MAINNET_RPCS = [
  'https://rpc.mainnet.arc.io',
]

/**
 * Build the ordered RPC URL list for a network.
 * rpcOverride (from RPC_URL env) is placed first when present.
 */
export function buildRpcList(network: KeeperNetwork, rpcOverride?: string): string[] {
  const defaults = network === 'mainnet' ? MAINNET_RPCS : TESTNET_RPCS
  if (rpcOverride) {
    // Deduplicate in case override matches a default
    return [rpcOverride, ...defaults.filter((u) => u !== rpcOverride)]
  }
  return [...defaults]
}

/**
 * Validate the SPLIT_NETWORK value.
 * Returns a typed KeeperNetwork or throws with a clear message.
 */
export function parseNetwork(raw: string | undefined): KeeperNetwork {
  const v = (raw ?? 'testnet').trim().toLowerCase()
  if (v === 'testnet' || v === 'mainnet') return v
  throw new Error(
    `SPLIT_NETWORK must be "testnet" or "mainnet", got: "${raw ?? ''}"`
  )
}

/**
 * Expected chain IDs per network — used to validate eth_chainId before
 * sending any transactions.
 */
export const EXPECTED_CHAIN_ID: Record<KeeperNetwork, number> = {
  testnet: 5042002,
  mainnet: 5042,
}

// ---------------------------------------------------------------------------
// Batch / concurrency helpers
// ---------------------------------------------------------------------------

/**
 * Run async tasks in bounded concurrent batches.
 * Returns results in the same order as `items`; each result is either
 * { ok: true, value } or { ok: false, error }.
 */
export async function batchedSettle<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: unknown }> =
    new Array(items.length)
  let cursor = 0

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      try {
        results[i] = { ok: true, value: await fn(items[i]) }
      } catch (err) {
        results[i] = { ok: false, error: err }
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    worker
  )
  await Promise.all(workers)
  return results
}
