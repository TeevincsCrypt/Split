/**
 * React hook: loads the connected payer's ScheduleCreated events + live schedule state.
 */
import { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { ACTIVE_NETWORK } from '@/config/networks'
import { fetchScheduleHistory, type ScheduleCreatedEvent } from '@/lib/scheduleHistory'
import { SCHEDULED_SPLIT_ABI } from '@/abi/ScheduledSplit'

export interface ScheduleWithState extends ScheduleCreatedEvent {
  executed: number
  cancelled: boolean
  nextDueTime: bigint
  remainingDeposit: bigint
}

export interface UseScheduleHistoryResult {
  schedules: ScheduleWithState[]
  loading: boolean
  rpcError: boolean
  retry: () => void
}

export function useScheduleHistory(): UseScheduleHistoryResult {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: ACTIVE_NETWORK.chainId })
  const contractAddress = ACTIVE_NETWORK.scheduledSplitAddress
  const [schedules, setSchedules] = useState<ScheduleWithState[]>([])
  // Initialize loading=true only when we actually have something to fetch
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
      if (!contractAddress) return

      const result = await fetchScheduleHistory(
        contractAddress,
        ACTIVE_NETWORK.scheduledSplitDeployBlock,
        address,
      )

      if (cancelled) return

      if (result.rpcError) {
        setRpcError(true)
        setLoading(false)
        return
      }

      // Enrich each schedule with live contract state
      const enriched: ScheduleWithState[] = []
      for (const ev of result.created) {
        if (cancelled) break
        try {
          let executed = 0
          let evCancelled = false
          let nextDueTime = 0n
          let remainingDeposit = 0n

          if (publicClient) {
            const [sched, ndt, rd] = await Promise.all([
              publicClient.readContract({
                address: contractAddress,
                abi: SCHEDULED_SPLIT_ABI,
                functionName: 'getSchedule',
                args: [ev.id],
              }) as Promise<{ executed: number; cancelled: boolean }>,
              publicClient.readContract({
                address: contractAddress,
                abi: SCHEDULED_SPLIT_ABI,
                functionName: 'nextDueTime',
                args: [ev.id],
              }),
              publicClient.readContract({
                address: contractAddress,
                abi: SCHEDULED_SPLIT_ABI,
                functionName: 'remainingDeposit',
                args: [ev.id],
              }),
            ])
            executed = Number(sched.executed)
            evCancelled = sched.cancelled
            nextDueTime = ndt
            remainingDeposit = rd
          }

          enriched.push({ ...ev, executed, cancelled: evCancelled, nextDueTime, remainingDeposit })
        } catch {
          // If a single schedule read fails, include it with defaults
          enriched.push({ ...ev, executed: 0, cancelled: false, nextDueTime: 0n, remainingDeposit: 0n })
        }
      }

      if (!cancelled) {
        setSchedules(enriched)
        setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [address, publicClient, retryToken, contractAddress])

  return { schedules, loading, rpcError, retry }
}
