import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import ContractNotConfigured from '@/components/ContractNotConfigured'
import ConnectPrompt from '@/components/ConnectPrompt'
import { ACTIVE_NETWORK } from '@/config/networks'
import StepEditor, { type TouchedState, initTouched } from '@/components/create/StepEditor'
import StepReview from '@/components/create/StepReview'
import StepApprove from '@/components/create/StepApprove'
import StepDistribute from '@/components/create/StepDistribute'
import { type RecipientRow } from '@/lib/validation'

export type CreateStep = 'editor' | 'review' | 'approve' | 'distribute'

export interface SplitDraft {
  name: string
  description: string
  totalAmountRaw: string // display string
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

const STEP_LABELS: Record<CreateStep, string> = {
  editor: 'Define',
  review: 'Review',
  approve: 'Approve',
  distribute: 'Distribute',
}

const STEP_ORDER: CreateStep[] = ['editor', 'review', 'approve', 'distribute']

export default function CreateSplit() {
  const { isConnected } = useAccount()
  const navigate = useNavigate()
  const [step, setStep] = useState<CreateStep>('editor')
  const [draft, setDraft] = useState<SplitDraft>(EMPTY_DRAFT)
  const [touched, setTouched] = useState<TouchedState>(() => initTouched(EMPTY_DRAFT.rows.length))

  function patchTouched(patch: Partial<TouchedState>) {
    setTouched((prev) => ({ ...prev, ...patch }))
  }

  if (!ACTIVE_NETWORK.distributorAddress) return <ContractNotConfigured />

  const stepIdx = STEP_ORDER.indexOf(step)

  function handleDistributed(id: bigint) {
    void navigate(`/d/${id}`)
  }

  // Gate: wallet required to move past the editor
  function handleEditorNext() {
    setStep('review')
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-5">
      {/* Step indicator — pill pagination */}
      <div className="flex items-center justify-center gap-2">
        {STEP_ORDER.map((s, i) => {
          const active = s === step
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
                <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
              </div>
              {i < STEP_ORDER.length - 1 && (
                <div className="w-3 h-px" style={{ background: 'var(--border)' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      {step === 'editor' && (
        <StepEditor
          draft={draft}
          touched={touched}
          onTouch={patchTouched}
          onChange={setDraft}
          onNext={handleEditorNext}
        />
      )}

      {/* Wallet gate: shown at Review step when not connected */}
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
    </div>
  )
}
