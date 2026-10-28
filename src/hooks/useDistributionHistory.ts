import { useState, useEffect, useCallback } from 'react'
import { fetchHistory, fetchOlderHistory, type DistributionEvent } from '@/lib/history'

interface Options {
  payer?: string
  limit?: number
}

export interface UseDistributionHistoryResult {
  events: DistributionEvent[]
  loading: boolean
  /** True when the RPC could not be reached (getBlockNumber failed) */
  rpcError: boolean
  partial: boolean
  /** True when there may be older events not yet loaded */
  hasOlder: boolean
  chainHead: bigint
  scannedFrom: bigint
  loadOlder: () => void
  loadingOlder: boolean
  retry: () => void
}

export function useDistributionHistory({ payer, limit }: Options = {}): UseDistributionHistoryResult {
  const [events, setEvents] = useState<DistributionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [rpcError, setRpcError] = useState(false)
  const [partial, setPartial] = useState(false)
  const [chainHead, setChainHead] = useState(0n)
  const [scannedFrom, setScannedFrom] = useState(0n)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [retryToken, setRetryToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const result = await fetchHistory({ payer })
      if (cancelled) return
      const filtered = limit ? result.events.slice(0, limit) : result.events
      setEvents(filtered)
      setRpcError(result.rpcError)
      setPartial(result.partial)
      setChainHead(result.chainHead)
      setScannedFrom(result.scannedFrom)
      setLoading(false)
    }
    void run()
    return () => { cancelled = true }
  }, [payer, limit, retryToken])

  const retry = useCallback(() => {
    setRetryToken((t) => t + 1)
  }, [])

  const loadOlder = useCallback(() => {
    if (loadingOlder) return
    setLoadingOlder(true)
    void fetchOlderHistory(scannedFrom, payer).then((result) => {
      setEvents((prev) => {
        const combined = [...result.events, ...prev]
        // de-dup by entry key (instant and scheduled ids can overlap)
        const seen = new Set<string>()
        const deduped = combined.filter((e) => {
          const k = e.key
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        deduped.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0))
        return limit ? deduped.slice(0, limit) : deduped
      })
      if (result.scannedFrom < scannedFrom) setScannedFrom(result.scannedFrom)
      setPartial(result.partial)
      setLoadingOlder(false)
    })
  }, [scannedFrom, payer, limit, loadingOlder])

  const hasOlder = !loading && !rpcError && scannedFrom > 0n

  return { events, loading, rpcError, partial, hasOlder, chainHead, scannedFrom, loadOlder, loadingOlder, retry }
}
