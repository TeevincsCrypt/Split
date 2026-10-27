import { useState, useEffect } from 'react'
import { fetchHistory, type DistributionEvent } from '@/lib/history'

interface Options {
  payer?: string
  limit?: number
}

export function useDistributionHistory({ payer, limit }: Options = {}) {
  const [events, setEvents] = useState<DistributionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [partial, setPartial] = useState(false)
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchHistory({
      payer,
      onProgress: (loaded, total) => {
        if (!cancelled) setProgress({ loaded, total })
      },
    }).then(({ events: evts, partial: p }) => {
      if (cancelled) return
      const filtered = limit ? evts.slice(0, limit) : evts
      setEvents(filtered)
      setPartial(p)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [payer, limit])

  return { events, loading, partial, progress }
}
