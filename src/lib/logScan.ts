/**
 * Backwards eth_getLogs scanner tuned to the public Arc RPC limits.
 *
 * Measured on Arc Testnet (scripts/rpc-probe.ts, 2026-10-28):
 *   rpc.blockdaemon.testnet.arc.io  ≤100,000 blocks per call
 *   rpc.testnet.arc.io              ≤10,000 blocks, rate-limits parallel calls
 *   rpc.quicknode.testnet.arc.io    ≤2,000 blocks
 *   rpc.testnet.arc.network         rejects calls ("Request exceeds defined limit")
 *
 * Each source is tried in order. If a source rejects a range, the range is halved
 * (down to MIN_RANGE) before moving to the next source, so unknown limits (e.g. on
 * mainnet) are discovered at runtime instead of failing the whole scan.
 *
 * No runtime imports: the probe script runs this exact code in CI.
 */
import type { AbiEvent, Address } from 'viem'

export interface LogClient {
  getLogs: (args: {
    address: Address
    event: AbiEvent
    args?: Record<string, unknown>
    fromBlock: bigint
    toBlock: bigint
  }) => Promise<readonly unknown[]>
}

export interface LogSource {
  client: LogClient
  /** Largest block range to request from this source. */
  maxRange: bigint
}

export interface ScanResult<L> {
  logs: L[]
  /** True if some range could not be read from any source. */
  partial: boolean
  /** Lowest block covered by this scan. */
  scannedFrom: bigint
}

const MIN_RANGE = 1_000n

async function readRange(
  sources: LogSource[],
  query: { address: Address; event: AbiEvent; args?: Record<string, unknown> },
  lo: bigint,
  hi: bigint,
): Promise<unknown[] | null> {
  for (const src of sources) {
    const out: unknown[] = []
    let size = src.maxRange
    let cursor = hi
    let ok = true
    while (cursor >= lo) {
      const from = cursor - size + 1n > lo ? cursor - size + 1n : lo
      try {
        const logs = await src.client.getLogs({ ...query, fromBlock: from, toBlock: cursor })
        out.push(...logs)
        cursor = from - 1n
      } catch {
        if (size <= MIN_RANGE) { ok = false; break }
        size = size / 2n
      }
    }
    if (ok) return out
  }
  return null
}

/**
 * Scan from `to` down to `floor`, newest first, until `done(logs)` returns true.
 * Ranges are sized by the first source and read `concurrency` at a time.
 */
export async function scanLogsBackward<L = unknown>(opts: {
  sources: LogSource[]
  address: Address
  event: AbiEvent
  args?: Record<string, unknown>
  floor: bigint
  to: bigint
  done?: (logs: L[]) => boolean
  concurrency?: number
}): Promise<ScanResult<L>> {
  const { sources, address, event, args, floor, to } = opts
  const done = opts.done ?? (() => false)
  const concurrency = opts.concurrency ?? 2
  const step = sources[0]?.maxRange ?? MIN_RANGE
  const logs: L[] = []
  let partial = false
  let hi = to
  let scannedFrom = to + 1n

  while (hi >= floor && !done(logs)) {
    const ranges: [bigint, bigint][] = []
    for (let i = 0; i < concurrency && hi >= floor; i++) {
      const lo = hi - step + 1n > floor ? hi - step + 1n : floor
      ranges.push([lo, hi])
      hi = lo - 1n
    }
    const results = await Promise.all(ranges.map(([lo, h]) => readRange(sources, { address, event, args }, lo, h)))
    for (const r of results) {
      if (r === null) partial = true
      else logs.push(...(r as L[]))
    }
    scannedFrom = ranges[ranges.length - 1][0]
  }
  return { logs, partial, scannedFrom }
}
