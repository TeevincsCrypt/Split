/**
 * /schedules — the connected payer's scheduled splits.
 * Shows status, next due time, paid/total, remaining deposit, and actions.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { Loader2, Plus, RefreshCw, ArrowUpRight, CheckCircle2, Clock, XCircle, Zap, AlertTriangle } from 'lucide-react'
import ConnectPrompt from '@/components/ConnectPrompt'
import WrongNetworkBanner from '@/components/WrongNetworkBanner'
import { ACTIVE_NETWORK } from '@/config/networks'
import { activeArcChain } from '@/config'
import { formatUsdcAmount } from '@/lib/allocation'
import { formatDueTime, formatCountdown } from '@/lib/schedule'
import { buildExplorerTx } from '@/lib/utils'
import { useScheduleHistory, type ScheduleWithState } from '@/hooks/useScheduleHistory'
import { SCHEDULED_SPLIT_ABI } from '@/abi/ScheduledSplit'
import RpcErrorBanner from '@/components/RpcErrorBanner'
import { decodeScheduleError } from '@/components/create/StepScheduleCreate'
import { executeSchedule } from '@/lib/scheduleTx'

type ScheduleStatus = 'upcoming' | 'due' | 'completed' | 'cancelled'

function getStatus(s: ScheduleWithState, nowSec: bigint): ScheduleStatus {
  if (s.cancelled) return 'cancelled'
  if (s.executed >= s.dueTimes.length) return 'completed'
  if (s.nextDueTime > 0n && s.nextDueTime <= nowSec) return 'due'
  return 'upcoming'
}

const STATUS_STYLE: Record<ScheduleStatus, { label: string; bg: string; color: string }> = {
  upcoming:  { label: 'Upcoming',  bg: 'var(--accent-dim)',  color: 'var(--accent)' },
  due:       { label: 'Due now',   bg: 'var(--warning-bg)',  color: 'var(--warning)' },
  completed: { label: 'Completed', bg: 'var(--success-bg)',  color: 'var(--success)' },
  cancelled: { label: 'Cancelled', bg: 'var(--surface-muted)', color: 'var(--subtle)' },
}

interface CancelDialogProps {
  schedule: ScheduleWithState
  onClose: () => void
  onCancelled: () => void
}

function CancelDialog({ schedule, onClose, onCancelled }: CancelDialogProps) {
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null)
  const [errMsg, setErrMsg] = useState('')
  const { address, chainId: walletChainId } = useAccount()
  const publicClient = usePublicClient({ chainId: ACTIVE_NETWORK.chainId })
  const { data: walletClient } = useWalletClient({ chainId: ACTIVE_NETWORK.chainId })

  const contractAddress = ACTIVE_NETWORK.scheduledSplitAddress!
  // Remaining = unpaid remaining payments (includes due-but-unpaid ones)
  const remainingPayments = schedule.dueTimes.length - schedule.executed
  const refund = schedule.amountPerPayment * BigInt(remainingPayments)
  const wrongChain = !!walletChainId && walletChainId !== ACTIVE_NETWORK.chainId

  async function handleCancel() {
    if (!walletClient || !publicClient || !address || wrongChain) return
    setState('pending')
    try {
      const hash = await walletClient.writeContract({
        address: contractAddress,
        abi: SCHEDULED_SPLIT_ABI,
        functionName: 'cancel',
        args: [schedule.id],
        account: address,
        chain: activeArcChain,
      })
      setTxHash(hash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
      if (receipt.status === 'reverted') {
        setErrMsg('Transaction reverted. Check the explorer for details.')
        setState('error')
        return
      }
      setState('done')
      setTimeout(onCancelled, 1200)
    } catch (err) {
      setErrMsg(decodeScheduleError(err))
      setState('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Cancel schedule"
    >
      <div className="card p-5 w-full max-w-md flex flex-col gap-4">
        <h3 className="display font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
          Cancel &amp; refund?
        </h3>

        {wrongChain && <WrongNetworkBanner />}

        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          This will cancel <strong>"{schedule.name}"</strong> and immediately refund{' '}
          <strong className="text-accent" style={{ color: 'var(--accent)' }}>
            {formatUsdcAmount(refund)} USDC
          </strong>
          {' '}({remainingPayments} unpaid payment{remainingPayments !== 1 ? 's' : ''} ×{' '}
          {formatUsdcAmount(schedule.amountPerPayment)} USDC each, including any due-but-unpaid payments).
          This cannot be undone.
        </p>

        {txHash && (
          <a href={buildExplorerTx(txHash)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
            <ArrowUpRight className="size-3" />View transaction
          </a>
        )}

        {state === 'done' && (
          <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--success)' }}>
            <CheckCircle2 className="size-4" />Cancelled — refund sent.
          </div>
        )}
        {state === 'error' && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>{errMsg}</p>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={state === 'pending'}
            className="flex-1 btn-ghost">
            Keep schedule
          </button>
          <button
            onClick={() => void handleCancel()}
            disabled={state !== 'idle' && state !== 'error'}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-sm font-bold"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
          >
            {state === 'pending' && <Loader2 className="size-4 animate-spin" />}
            Cancel &amp; refund
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleCard({ schedule, onAction }: { schedule: ScheduleWithState; onAction: () => void }) {
  const { chainId: cardChainId } = useAccount()
  const cardWrongChain = !!cardChainId && cardChainId !== ACTIVE_NETWORK.chainId
  const [nowSec] = useState(() => BigInt(Math.floor(Date.now() / 1000)))
  const status = getStatus(schedule, nowSec)
  const ss = STATUS_STYLE[status]
  const [cancelOpen, setCancelOpen] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [executeTx, setExecuteTx] = useState<`0x${string}` | null>(null)
  const [executeErr, setExecuteErr] = useState('')
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: ACTIVE_NETWORK.chainId })
  const { data: walletClient } = useWalletClient({ chainId: ACTIVE_NETWORK.chainId })
  const contractAddress = ACTIVE_NETWORK.scheduledSplitAddress!

  async function handleExecute() {
    if (!walletClient || !publicClient || !address) return
    if (cardWrongChain) {
      setExecuteErr(`Switch your wallet to ${ACTIVE_NETWORK.name} to release this payment.`)
      return
    }
    setExecuting(true)
    setExecuteErr('')
    const r = await executeSchedule({
      walletClient, publicClient, account: address, contractAddress, id: schedule.id,
      onSubmitted: setExecuteTx,
    })
    if (r.ok) onAction()
    else setExecuteErr(r.error)
    setExecuting(false)
  }

  return (
    <>
      {cancelOpen && (
        <CancelDialog
          schedule={schedule}
          onClose={() => setCancelOpen(false)}
          onCancelled={() => { setCancelOpen(false); onAction() }}
        />
      )}
      <div className="card p-4 flex flex-col gap-3 hover-lift">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <Link
              to={`/s/${schedule.id}`}
              className="font-bold text-sm hover:underline"
              style={{ color: 'var(--ink)' }}
            >
              {schedule.name}
            </Link>
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>
              ID #{schedule.id.toString()} · {schedule.recipients.length} recipient{schedule.recipients.length !== 1 ? 's' : ''}
            </span>
          </div>
          <span
            className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: ss.bg, color: ss.color }}
          >
            {ss.label}
          </span>
        </div>

        {/* Amounts */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--subtle)' }}>Per payment</span>
            <span className="font-mono font-bold tabular-nums text-sm" style={{ color: 'var(--ink)' }}>
              {formatUsdcAmount(schedule.amountPerPayment)} USDC
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--subtle)' }}>Progress</span>
            <span className="font-mono font-bold tabular-nums text-sm" style={{ color: 'var(--ink)' }}>
              {schedule.executed}/{schedule.dueTimes.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-widest font-bold" style={{ color: 'var(--subtle)' }}>Locked</span>
            <span className="font-mono font-bold tabular-nums text-sm" style={{ color: 'var(--accent)' }}>
              {formatUsdcAmount(schedule.remainingDeposit)} USDC
            </span>
          </div>
        </div>

        {/* Next due */}
        {status === 'upcoming' && schedule.nextDueTime > 0n && (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }}>
            <Clock className="size-3" />
            Next: {formatDueTime(schedule.nextDueTime)} ({formatCountdown(schedule.nextDueTime, nowSec)})
          </div>
        )}

        {/* Execute tx */}
        {executeTx && (
          <a href={buildExplorerTx(executeTx)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent)' }}>
            <ArrowUpRight className="size-3" />View execute tx
          </a>
        )}
        {executeErr && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>{executeErr}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap">
          <Link
            to={`/s/${schedule.id}`}
            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}
          >
            <ArrowUpRight className="size-3" />Details
          </Link>
          {status === 'due' && (
            <button
              onClick={() => void handleExecute()}
              disabled={executing}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              {executing ? <Loader2 className="size-3 animate-spin" /> : <Zap className="size-3" />}
              Release now
            </button>
          )}
          {!schedule.cancelled && schedule.executed < schedule.dueTimes.length && (
            <button
              onClick={() => setCancelOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: 'var(--surface-muted)', color: 'var(--danger)' }}
            >
              <XCircle className="size-3" />Cancel &amp; refund
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export default function Schedules() {
  const { isConnected } = useAccount()
  const navigate = useNavigate()
  const { schedules, loading, rpcError, retry } = useScheduleHistory()
  const [pageNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)))

  if (!ACTIVE_NETWORK.scheduledSplitAddress) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center flex flex-col gap-3 items-center">
        <AlertTriangle className="size-8" style={{ color: 'var(--subtle)' }} />
        <p className="font-semibold" style={{ color: 'var(--ink)' }}>Scheduled splits not configured</p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Set <code className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-muted)' }}>
            VITE_SCHEDULED_SPLIT_ADDRESS
          </code> to enable this feature.
        </p>
      </div>
    )
  }

  if (!isConnected) {
    return <ConnectPrompt message="Connect your wallet to view your scheduled splits." />
  }

  const due = schedules.filter((s) => getStatus(s, pageNow) === 'due')
  const upcoming = schedules.filter((s) => getStatus(s, pageNow) === 'upcoming')
  const completed = schedules.filter((s) => getStatus(s, pageNow) === 'completed')
  const cancelled = schedules.filter((s) => getStatus(s, pageNow) === 'cancelled')

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            Scheduled splits
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            Payments run at or shortly after the scheduled time — never before.
          </p>
        </div>
        <button onClick={() => void navigate('/create')} className="btn-primary flex items-center gap-2 py-2 px-4 text-sm">
          <Plus className="size-4" />New
        </button>
      </div>

      {rpcError && <RpcErrorBanner onRetry={retry} />}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      ) : schedules.length === 0 && !rpcError ? (
        <div className="card p-8 flex flex-col items-center gap-4 text-center">
          <div className="size-12 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
            <Clock className="size-6" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>No schedules yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
              Create a split and choose "Schedule" to set up recurring payments.
            </p>
          </div>
          <Link to="/create" className="btn-primary text-sm px-5 py-2">
            Create a schedule →
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {due.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--warning)' }}>
                Due now ({due.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {due.map((s) => <ScheduleCard key={s.id.toString()} schedule={s} onAction={retry} />)}
              </div>
            </section>
          )}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
                Upcoming ({upcoming.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {upcoming.map((s) => <ScheduleCard key={s.id.toString()} schedule={s} onAction={retry} />)}
              </div>
            </section>
          )}
          {completed.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
                Completed ({completed.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {completed.map((s) => <ScheduleCard key={s.id.toString()} schedule={s} onAction={retry} />)}
              </div>
            </section>
          )}
          {cancelled.length > 0 && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--subtle)' }}>
                Cancelled ({cancelled.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cancelled.map((s) => <ScheduleCard key={s.id.toString()} schedule={s} onAction={retry} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Refresh */}
      {!loading && schedules.length > 0 && (
        <button onClick={retry}
          className="self-center flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
          <RefreshCw className="size-3" />Refresh
        </button>
      )}
    </div>
  )
}
