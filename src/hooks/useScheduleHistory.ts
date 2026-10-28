/**
 * React hook: loads all schedule state for the connected payer.
 *
 * Discovery: scheduleCount() + fetchScheduleState(id) for ids 1..count,
 * newest-first, bounded concurrency of 8, cap 200 ids.
 * No getLogs — avoids "range too large" rejections on public RPCs.
 *
 * A failed getSchedule read yields a per-card "Couldn't load" entry
 * rather than a page-wide error.  The page-wide rpcError flag is only
 * set when scheduleCount()/getBlockNumber fails on every endpoint.
 */
import { useState, useEffect, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { ACTIVE_NETWORK } from '@/config/networks'
import {
  fetchScheduleCount,
  fetchScheduleState,
  type ScheduleState,
} from '@/lib/scheduleHistory'

export interface ScheduleWithState extends ScheduleState {
  /** true when fetchScheduleState returned null for this id */
  loadError: boolean
}

export interface UseScheduleHistoryResult {
  schedules: ScheduleWithState[]
  loading: boolean
  rpcError: boolean
  retry: () => void
}

const MAX_IDS = 200
const CONCURRENCY = 8

/** Run fn over items with at most `concurrency` in-flight at once. */
async function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length })
  let nextIdx = 0

  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++
      results[idx] = await fn(items[idx])
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export function useScheduleHistory(): UseScheduleHistoryResult {
  const { address } = useAccount()
  const contractAddress = ACTIVE_NETWORK.scheduledSplitAddress

  const [schedules, setSchedules] = useState<ScheduleWithState[]>([])
  const [loading, setLoading] = useState(!!contractAddress && !!address)
  const [rpcError, setRpcError] = useState(false)
  const [retryToken, setRetryToken] = useState(0)

  const retry = useCallback(() => setRetryToken((t) => t + 1), [])

  useEffect(() => {
    if (!contractAddress || !address) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setRpcError(false)

      // Step 1: get total count — page-wide error only if this fails
      const { count, rpcError: countErr } = await fetchScheduleCount(contractAddress!)
      if (cancelled) return
      if (countErr) {
        setRpcError(true)
        setLoading(false)
        return
      }
      if (count === 0n) {
        setSchedules([])
        setLoading(false)
        return
      }

      // Step 2: enumerate ids newest-first (id N down to 1), cap at MAX_IDS
      const total = count > BigInt(MAX_IDS) ? BigInt(MAX_IDS) : count
      const ids: bigint[] = []
      for (let i = count; i > count - total; i--) ids.push(i)

      // Step 3: read state for all ids with bounded concurrency
      const states = await withConcurrency(ids, CONCURRENCY, (id) =>
        fetchScheduleState(contractAddress!, id),
      )
      if (cancelled) return

      // Step 4: filter to payer, preserve newest-first order
      const result: ScheduleWithState[] = []
      for (let i = 0; i < ids.length; i++) {
        const s = states[i]
        if (s === null) {
          // Per-card error — include a placeholder so the UI can show "couldn't load"
          result.push({
            id: ids[i],
            payer: '0x0000000000000000000000000000000000000000',
            name: '',
            amountPerPayment: 0n,
            dueTimes: [],
            recipients: [],
            bps: [],
            executed: 0,
            cancelled: false,
            nextDueTime: 0n,
            remainingDeposit: 0n,
            loadError: true,
          })
        } else if (s.payer.toLowerCase() === address!.toLowerCase()) {
          result.push({ ...s, loadError: false })
        }
        // Schedules belonging to other payers are silently omitted
      }

      if (!cancelled) {
        setSchedules(result)
        setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [address, contractAddress, retryToken])

  return { schedules, loading, rpcError, retry }
}
