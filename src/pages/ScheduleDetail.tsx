/**
 * /s/:id — public schedule detail page.
 * Anyone (including recipients) can view the schedule and trigger "Release now" when due.
 */
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import {
  Loader2, ArrowUpRight, CheckCircle2, XCircle, Clock, Zap,
  AlertTriangle, ArrowLeft, RefreshCw,
} from 'lucide-react'
import { ACTIVE_NETWORK } from '@/config/networks'
import { formatUsdcAmount } from '@/lib/allocation'
import { formatDueTime, formatCountdown } from '@/lib/schedule'
import { formatAddress, buildExplorerTx, buildExplorerAddress } from '@/lib/utils'
import {
  fetchScheduleById, fetchExecutedEvents, fetchCancelledEvent,
  type ScheduleCreatedEvent, type ScheduleExecutedEvent, type ScheduleCancelledEvent,
} from '@/lib/scheduleHistory'
import { SCHEDULED_SPLIT_ABI } from '@/abi/ScheduledSplit'
import RpcErrorBanner from '@/components/RpcErrorBanner'
import { executeSchedule } from '@/lib/scheduleTx'

interface LiveState {
  executed: number
  cancelled: boolean
  nextDueTime: bigint
  remainingDeposit: bigint
}

export default function ScheduleDetail() {
  const { id } = useParams<{ id: string }>()
  const scheduleId = id ? BigInt(id) : null
  const { address, chainId: walletChainId } = useAccount()
  const publicClient = usePublicClient({ chainId: ACTIVE_NETWORK.chainId })
  const { data: walletClient } = useWalletClient({ chainId: ACTIVE_NETWORK.chainId })
  const contractAddress = ACTIVE_NETWORK.scheduledSplitAddress

  const [event, setEvent] = useState<ScheduleCreatedEvent | null>(null)
  const [liveState, setLiveState] = useState<LiveState | null>(null)
  const [executedEvents, setExecutedEvents] = useState<ScheduleExecutedEvent[]>([])
  const [cancelledEvent, setCancelledEvent] = useState<ScheduleCancelledEvent | null>(null)
  const [loading, setLoading] = useState(() => !!ACTIVE_NETWORK.scheduledSplitAddress)
  const [rpcError, setRpcError] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [retryToken, setRetryToken] = useState(0)

  // Execute state
  const [executing, setExecuting] = useState(false)
  const [executeTx, setExecuteTx] = useState<`0x${string}` | null>(null)
  const [executeErr, setExecuteErr] = useState('')
  // nowSec at mount (captured in state to avoid Date.now() on every render)
  const [nowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)))

  useEffect(() => {
    if (!contractAddress || !scheduleId) return
    let cancelled = false

    async function load() {
      if (!contractAddress || !scheduleId) return
      setLoading(true)
      setRpcError(false)
      setNotFound(false)
      const { event: ev, rpcError: err } = await fetchScheduleById(
        contractAddress,
        ACTIVE_NETWORK.scheduledSplitDeployBlock,
        scheduleId,
      )
      if (cancelled) return
      if (err) { setRpcError(true); setLoading(false); return }
      if (!ev) { setNotFound(true); setLoading(false); return }
      setEvent(ev)

      // Load live state and payment history in parallel
      try {
        const [sched, ndt, rd, execs, cancelEv] = await Promise.all([
          publicClient?.readContract({
            address: contractAddress,
            abi: SCHEDULED_SPLIT_ABI,
            functionName: 'getSchedule',
            args: [scheduleId],
          }) as Promise<{ executed: number; cancelled: boolean }> | undefined,
          publicClient?.readContract({
            address: contractAddress,
            abi: SCHEDULED_SPLIT_ABI,
            functionName: 'nextDueTime',
            args: [scheduleId],
          }),
          publicClient?.readContract({
            address: contractAddress,
            abi: SCHEDULED_SPLIT_ABI,
            functionName: 'remainingDeposit',
            args: [scheduleId],
          }),
          fetchExecutedEvents(contractAddress, ACTIVE_NETWORK.scheduledSplitDeployBlock, scheduleId),
          fetchCancelledEvent(contractAddress, ACTIVE_NETWORK.scheduledSplitDeployBlock, scheduleId),
        ])
        if (!cancelled) {
          if (sched) {
            setLiveState({
              executed: Number(sched.executed),
              cancelled: sched.cancelled,
              nextDueTime: ndt ?? 0n,
              remainingDeposit: rd ?? 0n,
            })
          }
          setExecutedEvents(execs)
          setCancelledEvent(cancelEv)
        }
      } catch { /* live state optional — the event data is sufficient */ }

      if (!cancelled) setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [contractAddress, scheduleId, publicClient, retryToken])

  async function handleExecute() {
    if (!walletClient || !publicClient || !address || !scheduleId || !contractAddress) return
    if (walletChainId && walletChainId !== ACTIVE_NETWORK.chainId) {
      setExecuteErr(`Switch your wallet to ${ACTIVE_NETWORK.name} to release this payment.`)
      return
    }
    setExecuting(true)
    setExecuteErr('')
    const r = await executeSchedule({
      walletClient, publicClient, account: address, contractAddress, id: scheduleId,
      onSubmitted: setExecuteTx,
    })
    if (r.ok) setRetryToken((t) => t + 1)
    else setExecuteErr(r.error)
    setExecuting(false)
  }

  if (!contractAddress) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <p className="font-semibold" style={{ color: 'var(--ink)' }}>Scheduled splits not configured</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-7 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  if (rpcError) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <RpcErrorBanner onRetry={() => setRetryToken((t) => t + 1)} />
      </div>
    )
  }

  if (notFound || !event) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center flex flex-col gap-3 items-center">
        <AlertTriangle className="size-8" style={{ color: 'var(--subtle)' }} />
        <p className="font-semibold" style={{ color: 'var(--ink)' }}>Schedule not found</p>
        <Link to="/schedules" className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--accent)' }}>
          <ArrowLeft className="size-4" />All schedules
        </Link>
      </div>
    )
  }

  const now = nowSec
  const isDue = liveState
    ? !liveState.cancelled && liveState.nextDueTime > 0n && liveState.nextDueTime <= now
    : false
  const isComplete = liveState ? liveState.executed >= event.dueTimes.length : false
  const isCancelled = liveState?.cancelled ?? false
  const totalDeposit = event.amountPerPayment * BigInt(event.dueTimes.length)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
      {/* Back */}
      <Link to="/schedules" className="flex items-center gap-1.5 text-sm font-semibold w-fit"
        style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" />All schedules
      </Link>

      {/* Header card */}
      <div className="card p-5 flex flex-col gap-4"
        style={isCancelled ? { opacity: 0.75 } : {}}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h1 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {event.name}
            </h1>
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>
              Schedule #{event.id.toString()}
            </span>
          </div>
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
            style={
              isCancelled ? { background: 'var(--surface-muted)', color: 'var(--subtle)' }
              : isComplete ? { background: 'var(--success-bg)', color: 'var(--success)' }
              : isDue ? { background: 'var(--warning-bg)', color: 'var(--warning)' }
              : { background: 'var(--accent-dim)', color: 'var(--accent)' }
            }
          >
            {isCancelled ? 'Cancelled' : isComplete ? 'Completed' : isDue ? 'Due now' : 'Upcoming'}
          </span>
        </div>

        {/* Amounts grid */}
        <div className="grid grid-cols-3 gap-3 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'var(--subtle)' }}>Per payment</p>
            <p className="font-mono font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatUsdcAmount(event.amountPerPayment)} USDC</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'var(--subtle)' }}>Progress</p>
            <p className="font-mono font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {liveState?.executed ?? 0}/{event.dueTimes.length}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'var(--subtle)' }}>Locked</p>
            <p className="font-mono font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
              {formatUsdcAmount(liveState?.remainingDeposit ?? totalDeposit)} USDC
            </p>
          </div>
        </div>

        {/* Next due */}
        {!isCancelled && !isComplete && liveState?.nextDueTime != null && liveState.nextDueTime > 0n && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            <Clock className="size-3" />
            Next: {formatDueTime(liveState.nextDueTime)} — {formatCountdown(liveState.nextDueTime, now)}
          </div>
        )}

        {/* Payer */}
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          <span>Payer:</span>
          <a href={buildExplorerAddress(event.payer)} target="_blank" rel="noopener noreferrer"
            className="font-mono hover:underline" style={{ color: 'var(--ink)' }}>
            {formatAddress(event.payer)}
          </a>
        </div>

        {/* Cancel notice */}
        {cancelledEvent && (
          <div className="flex items-start gap-2 text-xs p-3 rounded-xl"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
            <XCircle className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            Cancelled — {formatUsdcAmount(cancelledEvent.refund)} USDC refunded.{' '}
            <a href={buildExplorerTx(cancelledEvent.txHash)} target="_blank" rel="noopener noreferrer"
              className="underline" style={{ color: 'var(--muted)' }}>View tx</a>
          </div>
        )}

        {/* Release now — available to anyone */}
        {isDue && !executing && (
          <button
            onClick={() => void handleExecute()}
            className="btn-primary flex items-center justify-center gap-2"
          >
            <Zap className="size-4" />Release now
          </button>
        )}
        {executing && (
          <button disabled className="btn-primary flex items-center justify-center gap-2 opacity-70 cursor-not-allowed">
            <Loader2 className="size-4 animate-spin" />Releasing…
          </button>
        )}
        {executeTx && (
          <a href={buildExplorerTx(executeTx)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
            <ArrowUpRight className="size-3" />View release transaction
          </a>
        )}
        {executeErr && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>{executeErr}</p>
        )}
      </div>

      {/* Recipients */}
      <div className="card p-4 flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Recipients ({event.recipients.length})
        </h2>
        {event.recipients.map((addr, i) => (
          <div key={i} className="flex justify-between items-center py-1.5 border-b last:border-b-0 text-xs"
            style={{ borderColor: 'var(--border)' }}>
            <a href={buildExplorerAddress(addr)} target="_blank" rel="noopener noreferrer"
              className="font-mono hover:underline" style={{ color: 'var(--ink)' }}>
              {formatAddress(addr)}
            </a>
            <span className="font-mono tabular-nums" style={{ color: 'var(--muted)' }}>
              {(event.bps[i] / 100).toFixed(2)}% · {formatUsdcAmount(event.amountPerPayment * BigInt(event.bps[i]) / 10000n)} USDC/pmt
            </span>
          </div>
        ))}
      </div>

      {/* Payment timeline */}
      <div className="card p-4 flex flex-col gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          Payment timeline
        </h2>
        {event.dueTimes.map((dueTime, i) => {
          const executedPmt = executedEvents.find((e) => e.index === i)
          const paid = !!executedPmt || (liveState && i < liveState.executed)
          return (
            <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-b-0 text-xs"
              style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                {paid ? (
                  <CheckCircle2 className="size-3.5 shrink-0" style={{ color: 'var(--success)' }} />
                ) : (
                  <Clock className="size-3.5 shrink-0" style={{ color: 'var(--subtle)' }} />
                )}
                <span style={{ color: paid ? 'var(--ink)' : 'var(--muted)' }}>{formatDueTime(dueTime)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono tabular-nums" style={{ color: paid ? 'var(--success)' : 'var(--subtle)' }}>
                  {paid ? `Paid ${formatUsdcAmount(event.amountPerPayment)} USDC` : 'Pending'}
                </span>
                {executedPmt && (
                  <a href={buildExplorerTx(executedPmt.txHash)} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--muted)' }}>
                    <ArrowUpRight className="size-3" />
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Create tx */}
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--subtle)' }}>
        <span>Created in</span>
        <a href={buildExplorerTx(event.txHash)} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-0.5 font-mono hover:underline" style={{ color: 'var(--muted)' }}>
          block {event.blockNumber.toString()} <ArrowUpRight className="size-3" />
        </a>
      </div>

      {/* Refresh */}
      <button
        onClick={() => setRetryToken((t) => t + 1)}
        className="self-center flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full"
        style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
      >
        <RefreshCw className="size-3" />Refresh
      </button>
    </div>
  )
}
