const STEPS = [
  {
    key: 'extract',
    title: '提取技能',
    caption: '识别课程材料中的核心能力'
  },
  {
    key: 'generate',
    title: '生成方案',
    caption: '组织培养目标与阶段安排'
  }
] as const

export type TrainingPhase = 'idle' | 'extracting' | 'generating' | 'generated' | 'error'

export default function StepIndicator({ phase }: { phase: TrainingPhase }) {
  return (
    <div className="training-stepper" aria-label="培养方案生成步骤">
      {STEPS.map((step, index) => {
        const state = getStepState(step.key, phase)

        return (
          <div className={`training-step is-${state}`} key={step.key}>
            <span className="training-step-node">
              {state === 'complete' ? <span className="training-step-check" aria-hidden="true" /> : <span>{index + 1}</span>}
            </span>
            <span className="training-step-copy">
              <strong>{step.title}</strong>
              <em>{step.caption}</em>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function getStepState(stepKey: (typeof STEPS)[number]['key'], phase: TrainingPhase) {
  if (stepKey === 'extract') {
    if (phase === 'idle' || phase === 'extracting' || phase === 'error') {
      return phase === 'error' ? 'error' : 'active'
    }
    return 'complete'
  }

  if (phase === 'generating') return 'active'
  if (phase === 'generated') return 'complete'
  return 'pending'
}
