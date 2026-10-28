import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { Calendar, Zap } from 'lucide-react'
import ContractNotConfigured from '@/components/ContractNotConfigured'
import ConnectPrompt from '@/components/ConnectPrompt'
import { ACTIVE_NETWORK } from '@/config/networks'
import StepEditor, { type TouchedState, initTouched } from '@/components/create/StepEditor'
import StepReview from '@/components/create/StepReview'
import StepApprove from '@/components/create/StepApprove'
import StepDistribute from '@/components/create/StepDistribute'
import ScheduleForm, { type ScheduleFormState } from '@/components/create/ScheduleForm'
import StepScheduleApprove from '@/components/create/StepScheduleApprove'
import StepScheduleCreate from '@/components/create/StepScheduleCreate'
import { type RecipientRow } from '@/lib/validation'
import { computeDueTimes, parseDatetimeLocal } from '@/lib/schedule'

export type CreateStep = 'editor' | 'review' | 'approve' | 'distribute'
export type ScheduleStep = 'schedule-form' | 'schedule-review' | 'schedule-approve' | 'schedule-create'
export type PayMode = 'now' | 'scheduled'

export interface SplitDraft {
  name: string
  description: string
  totalAmountRaw: string
  totalAmountParsed: bigint | null
  rows: RecipientRow[]
}

const EMPTY_DRAFT: SplitDraft = {
  name: '',
  description: '',
  totalAmountRaw: '',
  totalAmountParsed: null,
  rows: [{ label: '', address: '', bps: 0 }],
}

const EMPTY_SCHEDULE_FORM: ScheduleFormState = {
  firstDatetime: '',
  repeat: 'none',
  count: 1,
}

const NOW_STEP_LABELS: Record<CreateStep, string> = {
  editor: 'Define',
  review: 'Review',
  approve: 'Approve',
  distribute: 'Send',
}
const NOW_STEP_ORDER: CreateStep[] = ['editor', 'review', 'approve', 'distribute']

const SCHED_STEP_LABELS: Record<ScheduleStep, string> = {
  'schedule-form':    'Schedule',
  'schedule-review':  'Review',
  'schedule-approve': 'Approve',
  'schedule-create':  'Create',
}
const SCHED_STEP_ORDER: ScheduleStep[] = ['schedule-form', 'schedule-review', 'schedule-approve', 'schedule-create']

// Validates the schedule form has a valid future date
function scheduleFormValid(form: ScheduleFormState): boolean {
  if (!form.firstDatetime) return false
  const d = parseDatetimeLocal(form.firstDatetime)
  if (!d || d.getTime() <= Date.now()) return false
  if (form.count < 1 || form.count > 24) return false
  const computed = computeDueTimes(form)
  return computed !== null && computed.dueTimes.length > 0
}

export default function CreateSplit() {
  const { isConnected } = useAccount()
  const navigate = useNavigate()

  // Pay now / Schedule mode — hidden when ScheduledSplit not configured
  const hasScheduled = !!ACTIVE_NETWORK.scheduledSplitAddress
  const [payMode, setPayMode] = useState<PayMode>('now')

  // Shared draft (editor)
  const [step, setStep] = useState<CreateStep>('editor')
  const [schedStep, setSchedStep] = useState<ScheduleStep>('schedule-form')
  const [draft, setDraft] = useState<SplitDraft>(EMPTY_DRAFT)
  const [touched, setTouched] = useState<TouchedState>(() => initTouched(EMPTY_DRAFT.rows.length))
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>(EMPTY_SCHEDULE_FORM)

  function patchTouched(patch: Partial<TouchedState>) {
    setTouched((prev) => ({ ...prev, ...patch }))
  }

  if (!ACTIVE_NETWORK.distributorAddress && !ACTIVE_NETWORK.scheduledSplitAddress) {
    return <ContractNotConfigured />
  }

  // Determine active step indicator arrays
  const isNow = payMode === 'now'
  const stepOrder = isNow ? NOW_STEP_ORDER : SCHED_STEP_ORDER
  const stepLabels = isNow ? NOW_STEP_LABELS : SCHED_STEP_LABELS
  const activeStep: string = isNow ? step : schedStep
  const stepIdx = stepOrder.indexOf(activeStep as never)

  // ------------------------------------------------------------------
  // Step-change handlers
  // ------------------------------------------------------------------
  function handleEditorNext() {
    if (payMode === 'now') {
      setStep('review')
    } else {
      setSchedStep('schedule-form')
    }
  }

  function handleDistributed(id: bigint) {
    void navigate(`/d/${id}`)
  }

  function handleScheduleCreated(id: bigint) {
    void navigate(`/s/${id}`)
  }

  // Switch pay mode: reset step
  function switchMode(m: PayMode) {
    setPayMode(m)
    setStep('editor')
    setSchedStep('schedule-form')
  }

  // ------------------------------------------------------------------
  // Render
  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-5">

      {/* Pay mode selector — only when ScheduledSplit is configured */}
      {hasScheduled && (step === 'editor' || (schedStep === 'schedule-form')) && (
        <div className="flex gap-2 p-1 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
          <button
            onClick={() => switchMode('now')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={payMode === 'now'
              ? { background: 'var(--card)', color: 'var(--ink)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
              : { color: 'var(--muted)' }}
          >
            <Zap className="size-4" />Pay now
          </button>
          <button
            onClick={() => switchMode('scheduled')}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={payMode === 'scheduled'
              ? { background: 'var(--card)', color: 'var(--ink)', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }
              : { color: 'var(--muted)' }}
          >
            <Calendar className="size-4" />Schedule
          </button>
        </div>
      )}

      {/* Step indicator — pill pagination */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {stepOrder.map((s, i) => {
          const active = s === activeStep
          const done = i < stepIdx
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                style={
                  active
                    ? { background: 'var(--accent)', color: '#fff' }
                    : done
                    ? { background: 'var(--success-bg)', color: 'var(--success)', border: '1px solid var(--success)' }
                    : { background: 'var(--surface-muted)', color: 'var(--subtle)', border: '1px solid var(--border)' }
                }
              >
                {done ? (
                  <span>✓</span>
                ) : (
                  <span
                    className="size-3.5 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: active ? 'rgba(255,255,255,0.25)' : 'var(--border)' }}
                  >
                    {i + 1}
                  </span>
                )}
                <span className="hidden sm:inline">{(stepLabels as Record<string, string>)[s]}</span>
              </div>
              {i < stepOrder.length - 1 && (
                <div className="w-3 h-px" style={{ background: 'var(--border)' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* ── PAY NOW FLOW ── */}
      {payMode === 'now' && (
        <>
          {step === 'editor' && (
            <StepEditor
              draft={draft}
              touched={touched}
              onTouch={patchTouched}
              onChange={setDraft}
              onNext={handleEditorNext}
            />
          )}

          {step === 'review' && !isConnected && (
            <ConnectPrompt message="Connect your wallet to review and sign the distribution." onBack={() => setStep('editor')} />
          )}
          {step === 'review' && isConnected && (
            <StepReview
              draft={draft}
              onBack={() => setStep('editor')}
              onNext={() => setStep('approve')}
            />
          )}
          {step === 'approve' && (
            <StepApprove
              draft={draft}
              onBack={() => setStep('review')}
              onNext={() => setStep('distribute')}
            />
          )}
          {step === 'distribute' && (
            <StepDistribute
              draft={draft}
              onBack={() => setStep('approve')}
              onDistributed={handleDistributed}
            />
          )}
        </>
      )}

      {/* ── SCHEDULE FLOW ── */}
      {payMode === 'scheduled' && (
        <>
          {/* Step 1: Editor + schedule form combined */}
          {schedStep === 'schedule-form' && (
            <>
              <StepEditor
                draft={draft}
                touched={touched}
                onTouch={patchTouched}
                onChange={setDraft}
                onNext={() => setSchedStep('schedule-review')}
                scheduleMode
              />
              {/* Schedule date picker — shown below editor */}
              <div className="card p-5 flex flex-col gap-4">
                <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>Payment schedule</h3>
                <ScheduleForm
                  totalAmountParsed={draft.totalAmountParsed}
                  value={scheduleForm}
                  onChange={setScheduleForm}
                />
                <button
                  onClick={() => setSchedStep('schedule-review')}
                  disabled={!draft.totalAmountParsed || !scheduleFormValid(scheduleForm)}
                  className="btn-primary"
                >
                  Review schedule →
                </button>
              </div>
            </>
          )}

          {/* Step 2: Review */}
          {schedStep === 'schedule-review' && !isConnected && (
            <ConnectPrompt message="Connect your wallet to review and schedule this split." onBack={() => setSchedStep('schedule-form')} />
          )}
          {schedStep === 'schedule-review' && isConnected && (
            <StepReview
              draft={draft}
              onBack={() => setSchedStep('schedule-form')}
              onNext={() => setSchedStep('schedule-approve')}
              scheduleForm={scheduleForm}
            />
          )}

          {/* Step 3: Approve deposit */}
          {schedStep === 'schedule-approve' && (
            <StepScheduleApprove
              draft={draft}
              scheduleForm={scheduleForm}
              onBack={() => setSchedStep('schedule-review')}
              onNext={() => setSchedStep('schedule-create')}
            />
          )}

          {/* Step 4: Create schedule */}
          {schedStep === 'schedule-create' && (
            <StepScheduleCreate
              draft={draft}
              scheduleForm={scheduleForm}
              onBack={() => setSchedStep('schedule-approve')}
              onCreated={handleScheduleCreated}
            />
          )}
        </>
      )}
    </div>
  )
}
