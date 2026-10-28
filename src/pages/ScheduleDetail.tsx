/**
 * /s/:id — public schedule detail page.
 * Anyone (including recipients) can view the schedule and trigger "Release now" when due.
 *
 * Primary load: fetchScheduleState() — a contract read, no getLogs, never fails on
 * RPC range limits.  Event history (payment timeline tx links, cancel refund) is
 * loaded separately and shown as "unavailable" if it fails, never blocking the page.
 */
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useWalletClient } from 'wagmi'
import {
  Loader2, ArrowUpRight, CheckCircle2, XCircle, Clock, Zap,
  AlertTriangle, ArrowLeft, RefreshCw,
} from 'lucide-react'
import { ACTIVE_NETWORK } from '@/config/networks'
import { activeArcChain } from '@/config'
import { formatUsdcAmount } from '@/lib/allocation'
import { formatDueTime, formatCountdown } from '@/lib/schedule'
import { formatAddress, buildExplorerTx, buildExplorerAddress } from '@/lib/utils'
import {
  fetchScheduleState,
  fetchExecutedEvents,
  fetchCancelledEvent,
  type ScheduleState,
  type ScheduleExecutedEvent,
  type ScheduleCancelledEvent,
} from '@/lib/scheduleHistory'
import { SCHEDULED_SPLIT_ABI } from '@/abi/ScheduledSplit'
import RpcErrorBanner from '@/components/RpcErrorBanner'
import WrongNetworkBanner from '@/components/WrongNetworkBanner'
import { decodeScheduleError } from '@/components/create/StepScheduleCreate'

export default function ScheduleDetail() {
  const { id } = useParams<{ id: string }>()
  const scheduleId = id ? BigInt(id) : null
  const { address, chainId: walletChainId } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: ACTIVE_NETWORK.chainId })
  const contractAddress = ACTIVE_NETWORK.scheduledSplitAddress

  // Primary state — from readContract, no logs
  const [sched, setSched] = useState<ScheduleState | null>(null)
  const [loading, setLoading] = useState(() => !!ACTIVE_NETWORK.scheduledSplitAddress)
  const [rpcError, setRpcError] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [retryToken, setRetryToken] = useState(0)

  // Event history — secondary, non-fatal
  const [executedEvents, setExecutedEvents] = useState<ScheduleExecutedEvent[]>([])
  const [cancelledEvent, setCancelledEvent] = useState<ScheduleCancelledEvent | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyUnavailable, setHistoryUnavailable] = useState(false)

  // Execute state
  const [executing, setExecuting] = useState(false)
  const [executeTx, setExecuteTx] = useState<`0x${string}` | null>(null)
  const [executeErr, setExecuteErr] = useState('')
  // nowSec at mount (captured in state to avoid Date.now() on every render)
  const [nowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)))

  // Primary load — contract reads only
  useEffect(() => {
    if (!contractAddress || !scheduleId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setRpcError(false)
      setNotFound(false)

      const state = await fetchScheduleState(contractAddress!, scheduleId!)
      if (cancelled) return

      if (state === null) {
        // null means RPC call failed entirely — treat as page-wide error
        setRpcError(true)
        setLoading(false)
        return
      }

      // id 0 doesn't exist; a schedule with empty name and zero recipients is "not found"
      if (state.recipients.length === 0) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setSched(state)
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [contractAddress, scheduleId, retryToken])

  // Secondary load — event history (non-fatal)
  useEffect(() => {
    if (!contractAddress || !scheduleId || !sched) return
    let cancelled = false

    async function loadHistory() {
      try {
        const [execs, cancelEv] = await Promise.all([
          fetchExecutedEvents(contractAddress!, ACTIVE_NETWORK.scheduledSplitDeployBlock, scheduleId!),
          fetchCancelledEvent(contractAddress!, ACTIVE_NETWORK.scheduledSplitDeployBlock, scheduleId!),
        ])
        if (!cancelled) {
          setExecutedEvents(execs)
          setCancelledEvent(cancelEv)
          setHistoryLoading(false)
        }
      } catch {
        if (!cancelled) {
          setHistoryUnavailable(true)
          setHistoryLoading(false)
        }
      }
    }

    void loadHistory()
    return () => { cancelled = true }
  }, [contractAddress, scheduleId, sched])

  async function handleExecute() {
    if (!walletClient || !address || !scheduleId || !contractAddress) return
    if (walletChainId && walletChainId !== ACTIVE_NETWORK.chainId) {
      setExecuteErr(`Switch your wallet to ${ACTIVE_NETWORK.name} to release this payment.`)
      return
    }
    setExecuting(true)
    setExecuteErr('')

    try {
      // Simulate first
      const { request } = await import('viem').then(({ createPublicClient, http }) => {
        const pc = createPublicClient({ chain: activeArcChain, transport: http(ACTIVE_NETWORK.rpcUrl) })
        return pc.simulateContract({
          address: contractAddress,
          abi: SCHEDULED_SPLIT_ABI,
          functionName: 'execute',
          args: [scheduleId],
          account: address,
        })
      })
      const hash = await walletClient.writeContract({ ...request, chain: activeArcChain })
      setExecuteTx(hash)

      // Wait for receipt
      const { createPublicClient: mkPc, fallback, http } = await import('viem')
      const pc = mkPc({
        chain: activeArcChain,
        transport: fallback(ACTIVE_NETWORK.rpcUrls.map((u) => http(u))),
      })
      const receipt = await pc.waitForTransactionReceipt({ hash, timeout: 120_000 })
      if (receipt.status === 'reverted') {
        setExecuteErr('Transaction reverted. Check the explorer for details.')
      } else {
        // Refresh primary state
        setRetryToken((t) => t + 1)
      }
    } catch (err) {
      setExecuteErr(decodeScheduleError(err))
    } finally {
      setExecuting(false)
    }
  }

  // ---  Early returns  ---

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

  if (notFound || !sched) {
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
  const isDue = !sched.cancelled && sched.nextDueTime > 0n && sched.nextDueTime <= now
  const isComplete = sched.executed >= sched.dueTimes.length
  const isCancelled = sched.cancelled
  const totalDeposit = sched.amountPerPayment * BigInt(sched.dueTimes.length)
  const wrongChain = !!walletChainId && walletChainId !== ACTIVE_NETWORK.chainId

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-5">
      {/* Back */}
      <Link to="/schedules" className="flex items-center gap-1.5 text-sm font-semibold w-fit"
        style={{ color: 'var(--muted)' }}>
        <ArrowLeft className="size-4" />All schedules
      </Link>

      {wrongChain && <WrongNetworkBanner />}

      {/* Header card */}
      <div className="card p-5 flex flex-col gap-4"
        style={isCancelled ? { opacity: 0.75 } : {}}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h1 className="display font-bold text-xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
              {sched.name}
            </h1>
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>
              Schedule #{sched.id.toString()}
            </span>
          </div>
          <span
            className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0"
            style={
              isCancelled ? { background: 'var(--surface-muted)', color: 'var(--subtle)' }
              : isComplete ? { background: 'var(--success-bg)', color: 'var(--success)' }
              : isDue     ? { background: 'var(--warning-bg)',  color: 'var(--warning)' }
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
            <p className="font-mono font-bold tabular-nums" style={{ color: 'var(--ink)' }}>{formatUsdcAmount(sched.amountPerPayment)} USDC</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'var(--subtle)' }}>Progress</p>
            <p className="font-mono font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
              {sched.executed}/{sched.dueTimes.length}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest font-bold mb-0.5" style={{ color: 'var(--subtle)' }}>Locked</p>
            <p className="font-mono font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
              {formatUsdcAmount(sched.remainingDeposit > 0n ? sched.remainingDeposit : totalDeposit)} USDC
            </p>
          </div>
        </div>

        {/* Next due */}
        {!isCancelled && !isComplete && sched.nextDueTime > 0n && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            <Clock className="size-3" />
            Next: {formatDueTime(sched.nextDueTime)} — {formatCountdown(sched.nextDueTime, now)}
          </div>
        )}

        {/* Payer */}
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
          <span>Payer:</span>
          <a href={buildExplorerAddress(sched.payer)} target="_blank" rel="noopener noreferrer"
            className="font-mono hover:underline" style={{ color: 'var(--ink)' }}>
            {formatAddress(sched.payer)}
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

        {/* Release now — available to anyone when due */}
        {isDue && !executing && (
          <button
            onClick={() => void handleExecute()}
            disabled={wrongChain}
            className="btn-primary flex items-center justify-center gap-2"
            style={wrongChain ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            <Zap className="size-4" />
            {wrongChain ? `Switch to ${ACTIVE_NETWORK.name}` : 'Release now'}
          </button>
        )}
        {isDue && executing && (
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
          Recipients ({sched.recipients.length})
        </h2>
        {sched.recipients.map((addr, i) => (
          <div key={i} className="flex justify-between items-center py-1.5 border-b last:border-b-0 text-xs"
            style={{ borderColor: 'var(--border)' }}>
            <a href={buildExplorerAddress(addr)} target="_blank" rel="noopener noreferrer"
              className="font-mono hover:underline" style={{ color: 'var(--ink)' }}>
              {formatAddress(addr)}
            </a>
            <span className="font-mono tabular-nums" style={{ color: 'var(--muted)' }}>
              {(sched.bps[i] / 100).toFixed(2)}% · {formatUsdcAmount(sched.amountPerPayment * BigInt(sched.bps[i]) / 10000n)} USDC/pmt
            </span>
          </div>
        ))}
      </div>

      {/* Payment timeline */}
      <div className="card p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            Payment timeline
          </h2>
          {historyLoading && <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--subtle)' }} />}
        </div>

        {historyUnavailable && (
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Payment history unavailable — on-chain event log could not be fetched.
            Paid/unpaid status below is derived from the contract state.
          </p>
        )}

        {sched.dueTimes.map((dueTime, i) => {
          const executedPmt = executedEvents.find((e) => e.index === i)
          const paid = !!executedPmt || i < sched.executed
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
                  {paid ? `Paid ${formatUsdcAmount(sched.amountPerPayment)} USDC` : 'Pending'}
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
