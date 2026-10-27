import { useCallback, useEffect, useRef, useState } from 'react'
import CircuitCanvas from './components/CircuitCanvas'
import EvaluatePanel from './components/EvaluatePanel'
import HealthStatus from './components/HealthStatus'
import PredictionScreen from './components/PredictionScreen'
import SimulatePanel from './components/SimulatePanel'
import SnapBuildLab from './components/SnapBuildLab'
import type { SimulateResult } from './api/client'
import { recordPrediction } from './api/client'
import { PRESETS } from './data/presets'
import { L1 } from './lessons/l1'
import { TRANSFER } from './lessons/transfer'
import type { Prediction } from './lessons/lesson'
import { CHOICE_LABELS, matchesExpected } from './lessons/lesson'

function PredictionSummary({ prediction, hint }: { prediction: Prediction; hint: string }) {
  return (
    <div className="border-glass-border rounded-2xl border p-4">
      <p className="text-sm">
        <span className="text-ink-muted">Your prediction: </span>
        {CHOICE_LABELS[prediction.choice]}
        {prediction.why.trim() === '' ? '' : ` — “${prediction.why.trim()}”`}
      </p>
      <p className="text-ink-muted mt-1 text-sm">{hint}</p>
    </div>
  )
}

export default function App() {
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [l1Prediction, setL1Prediction] = useState<Prediction | null>(null)
  const [l1Done, setL1Done] = useState(false)
  const [twistStarted, setTwistStarted] = useState(false)
  const [twistPrediction, setTwistPrediction] = useState<Prediction | null>(null)
  const [twistSession, setTwistSession] = useState<string | null>(null)
  const [twistDone, setTwistDone] = useState(false)
  const [transferStarted, setTransferStarted] = useState(false)
  const [transferPrediction, setTransferPrediction] = useState<Prediction | null>(null)
  const preset = PRESETS.find((option) => option.id === presetId) ?? PRESETS[0]

  const handleL1Solved = useCallback((result: SimulateResult) => {
    if (matchesExpected(result, L1.expectedFixed)) {
      setL1Done(true)
    }
  }, [])

  const handleTwistSolved = useCallback((result: SimulateResult) => {
    if (matchesExpected(result, L1.twist.expectedFixed)) {
      setTwistDone(true)
    }
  }, [])

  const stage = !l1Prediction
    ? 'l1-predict'
    : !twistStarted
      ? 'l1-build'
      : !twistPrediction
        ? 'twist-predict'
        : !transferStarted
          ? 'twist-build'
          : !transferPrediction
            ? 'transfer-predict'
            : 'transfer-build'
  const firstStage = useRef(true)
  useEffect(() => {
    if (firstStage.current) {
      firstStage.current = false
      return
    }
    document.getElementById('lesson-flow')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [stage])

  const handleTwistPredicted = (prediction: Prediction) => {
    setTwistPrediction(prediction)
    void (async () => {
      try {
        const recorded = await recordPrediction(
          prediction.lessonId,
          prediction.choice,
          prediction.why,
        )
        setTwistSession(recorded.session_id)
      } catch {
        // The twist flow never blocks on coach recording; Ask the coach
        // explains the missing session if the learner tries it.
        setTwistSession(null)
      }
    })()
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 pb-12">
      <header className="flex h-14 shrink-0 items-center">
        <p className="text-xl font-semibold tracking-tight">Verityn</p>
        <p className="text-ink-muted ml-3 text-sm">Predict. Build. Reality check.</p>
      </header>
      <main className="flex flex-col gap-8">
        <HealthStatus />
        <div id="lesson-flow" className="flex scroll-mt-4 flex-col gap-8">
        {l1Prediction === null ? (
          <PredictionScreen challenge={L1} eyebrow="Step 1 of 3" onComplete={setL1Prediction} />
        ) : !twistStarted ? (
          <>
            <PredictionSummary prediction={l1Prediction} hint={L1.fix.hint} />
            <CircuitCanvas
              key="l1"
              seed={L1.seed}
              onSolved={handleL1Solved}
              prediction={l1Prediction}
              challenge={L1}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!l1Done}
                onClick={() => setTwistStarted(true)}
                className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                Try the Twist
              </button>
              {!l1Done && (
                <p className="text-ink-muted text-sm">Light the bulb first to unlock the Twist.</p>
              )}
            </div>
          </>
        ) : twistPrediction === null ? (
          <PredictionScreen
            challenge={L1.twist}
            eyebrow="Twist 1 of 2"
            onComplete={handleTwistPredicted}
          />
        ) : !transferStarted ? (
          <>
            <PredictionSummary prediction={twistPrediction} hint={L1.twist.fix.hint} />
            <CircuitCanvas
              key="twist"
              seed={L1.twist.seed}
              eyebrow="Twist 2 of 2"
              choice={twistPrediction.choice}
              claim={L1.twist.claim}
              coachSession={twistSession}
              onSolved={handleTwistSolved}
              prediction={twistPrediction}
              challenge={L1.twist}
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!twistDone}
                onClick={() => setTransferStarted(true)}
                className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start solo transfer
              </button>
              {!twistDone && (
                <p className="text-ink-muted text-sm">Complete the Twist circuit first.</p>
              )}
            </div>
          </>
        ) : transferPrediction === null ? (
          <PredictionScreen
            challenge={TRANSFER}
            eyebrow="Solo 1 of 2"
            continueLabel="Continue to wire it"
            onComplete={setTransferPrediction}
          />
        ) : (
          <>
            <PredictionSummary prediction={transferPrediction} hint={TRANSFER.fix.hint} />
            <div className="glass-panel p-4" role="note">
              <p className="text-ink-muted text-sm">
                Solo mode — the AI coach is off for this challenge. Predict, build, and check
                against the simulator.
              </p>
            </div>
            <CircuitCanvas
              key="transfer"
              seed={TRANSFER.seed}
              eyebrow="Solo 2 of 2"
              choice={transferPrediction.choice}
              claim={TRANSFER.claim}
              prediction={transferPrediction}
              challenge={TRANSFER}
              solo
            />
          </>
        )}
        </div>
        <details className="glass-panel p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Dev / Debug Inspector
            <span className="text-ink-muted ml-2 font-normal">
              Raw API benches — not part of the learning flow.
            </span>
          </summary>
          <div className="mt-4 flex flex-col gap-8">
            <SimulatePanel preset={preset} onSelectPreset={setPresetId} />
            <EvaluatePanel key={preset.id} preset={preset} />
          </div>
        </details>
        <SnapBuildLab />
      </main>
    </div>
  )
}
