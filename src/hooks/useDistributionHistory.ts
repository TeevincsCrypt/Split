import { useState, useEffect, useCallback } from 'react'
import { fetchHistory, fetchOlderHistory, type DistributionEvent } from '@/lib/history'

interface Options {
  payer?: string
  limit?: number
}

export interface UseDistributionHistoryResult {
  events: DistributionEvent[]
  loading: boolean
  partial: boolean
  /** True when there may be older events not yet loaded */
  hasOlder: boolean
  chainHead: bigint
  scannedFrom: bigint
  loadOlder: () => void
  loadingOlder: boolean
}

export function useDistributionHistory({ payer, limit }: Options = {}): UseDistributionHistoryResult {
  const [events, setEvents] = useState<DistributionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [partial, setPartial] = useState(false)
  const [chainHead, setChainHead] = useState(0n)
  const [scannedFrom, setScannedFrom] = useState(0n)
  const [loadingOlder, setLoadingOlder] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchHistory({ payer }).then((result) => {
      if (cancelled) return
      const filtered = limit ? result.events.slice(0, limit) : result.events
      setEvents(filtered)
      setPartial(result.partial)
      setChainHead(result.chainHead)
      setScannedFrom(result.scannedFrom)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [payer, limit])

  const loadOlder = useCallback(() => {
    if (loadingOlder) return
    setLoadingOlder(true)
    void fetchOlderHistory(scannedFrom, payer).then((result) => {
      setEvents((prev) => {
        const combined = [...result.events, ...prev]
        // de-dup by distributionId
        const seen = new Set<string>()
        const deduped = combined.filter((e) => {
          const k = e.distributionId.toString()
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        deduped.sort((a, b) => (b.distributionId > a.distributionId ? 1 : -1))
        return limit ? deduped.slice(0, limit) : deduped
      })
      if (result.scannedFrom < scannedFrom) setScannedFrom(result.scannedFrom)
      setPartial(result.partial)
      setLoadingOlder(false)
    })
  }, [scannedFrom, payer, limit, loadingOlder])

  const hasOlder = !loading && scannedFrom > (events[events.length - 1]?.blockNumber ?? scannedFrom)
    ? false
    : !loading && scannedFrom > 0n

  return { events, loading, partial, hasOlder, chainHead, scannedFrom, loadOlder, loadingOlder }
}
