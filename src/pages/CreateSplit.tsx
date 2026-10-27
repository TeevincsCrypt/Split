import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import ConnectPrompt from '@/components/ConnectPrompt'
import ContractNotConfigured from '@/components/ContractNotConfigured'
import { ACTIVE_NETWORK } from '@/config/networks'
import StepEditor from '@/components/create/StepEditor'
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
  if (!ACTIVE_NETWORK.distributorAddress) return <ContractNotConfigured />
  if (!isConnected) return <ConnectPrompt message="Connect your wallet to create a split." />

  const stepIdx = STEP_ORDER.indexOf(step)

  function handleDistributed(id: bigint) {
    void navigate(`/d/${id}`)
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEP_ORDER.map((s, i) => {
          const active = s === step
          const done = i < stepIdx
          return (
            <div key={s} className="flex items-center gap-0 flex-1">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="size-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--surface)',
                    border: `1.5px solid ${done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border)'}`,
                    color: active || done ? '#0d1b2f' : 'var(--subtle)',
                  }}
                >
                  {done ? '✓' : i + 1}
                </div>
                <span
                  className="text-xs font-medium"
                  style={{ color: active ? 'var(--ink)' : 'var(--subtle)' }}
                >
                  {STEP_LABELS[s]}
                </span>
              </div>
              {i < STEP_ORDER.length - 1 && (
                <div
                  className="flex-1 h-px mx-1 mb-4"
                  style={{ background: done ? 'var(--success)' : 'var(--border)' }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      {step === 'editor' && (
        <StepEditor
          draft={draft}
          onChange={setDraft}
          onNext={() => setStep('review')}
        />
      )}
      {step === 'review' && (
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
