import { useCallback, useEffect, useRef, useState } from 'react'
import CircuitCanvas from './components/CircuitCanvas'
import EvaluatePanel from './components/EvaluatePanel'
import JourneyFinale, { type ChapterRecap } from './components/JourneyFinale'
import JourneyShell from './components/JourneyShell'
import LabIntro from './components/LabIntro'
import PredictionScreen from './components/PredictionScreen'
import SimulatePanel from './components/SimulatePanel'
import SnapBuildLab from './components/SnapBuildLab'
import type { SimulateResult, VerdictStatus } from './api/client'
import { recordPrediction } from './api/client'
import { PRESETS } from './data/presets'
import { L1 } from './lessons/l1'
import { TRANSFER } from './lessons/transfer'
import type { Prediction } from './lessons/lesson'
import { CHOICE_LABELS, matchesExpected } from './lessons/lesson'
import type { TraceInput } from './lessons/trace'
import { stageFor, type Stage } from './journey/stages'

/** Beat before auto-advance, so the learner sees the solved circuit first. */
const ADVANCE_BEAT_MS = 4000
/** Shorter beat once the coach has been heard. */
const COACHED_BEAT_MS = 2000

type Beat = { kind: 'advance'; text: string } | { kind: 'paused'; text: string }

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function PredictionSummary({ prediction, hint }: { prediction: Prediction; hint: string }) {
  return (
    <div className="rounded-2xl border border-glass-border p-4">
      <p className="text-sm">
        <span className="text-ink-muted">Your prediction: </span>
        {CHOICE_LABELS[prediction.choice]}
        {prediction.why.trim() === '' ? '' : ` — “${prediction.why.trim()}”`}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{hint}</p>
    </div>
  )
}

const STAGE_CONTENT: Record<Stage, null> = {
  intro: null,
  'l1-predict': null,
  'l1-build': null,
  'twist-predict': null,
  'twist-build': null,
  'transfer-predict': null,
  'transfer-build': null,
  finale: null,
}

export default function App() {
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [entered, setEntered] = useState(false)
  const [l1Prediction, setL1Prediction] = useState<Prediction | null>(null)
  const [twistStarted, setTwistStarted] = useState(false)
  const [twistPrediction, setTwistPrediction] = useState<Prediction | null>(null)
  const [twistSession, setTwistSession] = useState<string | null>(null)
  const [transferStarted, setTransferStarted] = useState(false)
  const [transferPrediction, setTransferPrediction] = useState<Prediction | null>(null)
  const [transferDone, setTransferDone] = useState(false)
  const [snapshots, setSnapshots] = useState<Record<string, TraceInput>>({})
  const [beat, setBeat] = useState<Beat | null>(null)
  const preset = PRESETS.find((option) => option.id === presetId) ?? PRESETS[0]

  const advanceTimer = useRef<number | null>(null)
  const paused = useRef(false)

  const cancelAdvance = useCallback(() => {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current)
      advanceTimer.current = null
    }
  }, [])

  useEffect(() => () => cancelAdvance(), [cancelAdvance])

  const scheduleAdvance = useCallback(
    (text: string, delay: number, advance: () => void) => {
      cancelAdvance()
      paused.current = false
      setBeat({ kind: 'advance', text })
      document
        .querySelector('[aria-label="Evidence trace"]')
        ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
      advanceTimer.current = window.setTimeout(() => {
        advanceTimer.current = null
        setBeat(null)
        advance()
      }, delay)
    },
    [cancelAdvance],
  )

  const handleEvidence = useCallback((chapterId: string, input: TraceInput) => {
    setSnapshots((current) => ({ ...current, [chapterId]: input }))
  }, [])

  const handleL1Solved = useCallback(
    (result: SimulateResult) => {
      if (matchesExpected(result, L1.expectedFixed)) {
        scheduleAdvance('Reality check passed — the Twist is next…', ADVANCE_BEAT_MS, () =>
          setTwistStarted(true),
        )
      }
    },
    [scheduleAdvance],
  )

  const handleTwistSolved = useCallback(
    (result: SimulateResult) => {
      if (matchesExpected(result, L1.twist.expectedFixed)) {
        scheduleAdvance('Twist solved — going solo…', ADVANCE_BEAT_MS, () =>
          setTransferStarted(true),
        )
      }
    },
    [scheduleAdvance],
  )

  const handleTransferSolved = useCallback(
    (result: SimulateResult) => {
      if (matchesExpected(result, TRANSFER.expectedFixed)) {
        scheduleAdvance('Solo complete — revealing your journey…', ADVANCE_BEAT_MS, () =>
          setTransferDone(true),
        )
      }
    },
    [scheduleAdvance],
  )

  /** A contradicted twist pauses the advance so the coach can step in. */
  const handleTwistVerdict = useCallback(
    (status: VerdictStatus) => {
      if (status === 'CONTRADICTED' && advanceTimer.current !== null) {
        cancelAdvance()
        paused.current = true
        setBeat({
          kind: 'paused',
          text: 'The model disagrees — ask the coach, or continue solo.',
        })
      }
    },
    [cancelAdvance],
  )

  const continueToSolo = useCallback(() => {
    cancelAdvance()
    paused.current = false
    setBeat(null)
    setTransferStarted(true)
  }, [cancelAdvance])

  const handleTwistCoached = useCallback(() => {
    if (paused.current) {
      scheduleAdvance('Coach heard — going solo…', COACHED_BEAT_MS, () =>
        setTransferStarted(true),
      )
    }
  }, [scheduleAdvance])

  /** Edits during the beat cancel the advance; re-solving restarts it. */
  const handleDirty = useCallback(() => {
    cancelAdvance()
    if (!paused.current) {
      setBeat(null)
    }
  }, [cancelAdvance])

  const stage = stageFor({
    entered,
    l1Prediction: l1Prediction !== null,
    twistStarted,
    twistPrediction: twistPrediction !== null,
    transferStarted,
    transferPrediction: transferPrediction !== null,
    transferDone,
  })

  const firstStage = useRef(true)
  useEffect(() => {
    if (firstStage.current) {
      firstStage.current = false
      return
    }
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
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

  const finaleChapters: ChapterRecap[] = (
    [
      { id: L1.id, title: L1.title, solo: false },
      { id: L1.twist.id, title: L1.twist.title, solo: false },
      { id: TRANSFER.id, title: TRANSFER.title, solo: true },
    ] as const
  ).flatMap((chapter) => {
    const input = snapshots[chapter.id]
    return input ? [{ ...chapter, input }] : []
  })

  const beatNode =
    beat === null ? null : (
      <div className="beat-pill" role="status" aria-live="polite">
        <span className="h-2 w-2 shrink-0 rounded-full bg-flow" aria-hidden="true" />
        <span className="overflow-hidden text-ellipsis">{beat.text}</span>
        {beat.kind === 'paused' && (
          <button
            type="button"
            onClick={continueToSolo}
            className="border-glass-border ml-1 min-h-[32px] shrink-0 rounded-full border px-3 text-xs font-medium"
          >
            Continue to solo
          </button>
        )}
      </div>
    )

  return (
    <JourneyShell
      stage={stage}
      beat={beatNode}
      tools={
        <>
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold">Dev / Debug Inspector</h3>
            <SimulatePanel preset={preset} onSelectPreset={setPresetId} />
            <EvaluatePanel key={preset.id} preset={preset} />
          </div>
          <SnapBuildLab />
        </>
      }
    >
      {stage === 'intro' && <LabIntro onEnter={() => setEntered(true)} />}
      {stage === 'l1-predict' && (
        <PredictionScreen
          challenge={L1}
          eyebrow="Predict · Light the bulb"
          coachLine="I'm your coach. Commit to a prediction first — I stay quiet until you've tested it."
          onComplete={setL1Prediction}
        />
      )}
      {stage === 'l1-build' && l1Prediction !== null && (
        <div className="flex flex-col gap-4">
          <PredictionSummary prediction={l1Prediction} hint={L1.fix.hint} />
          <CircuitCanvas
            key="l1"
            seed={L1.seed}
            eyebrow="Build · Light the bulb"
            onSolved={handleL1Solved}
            onDirty={handleDirty}
            onEvidence={handleEvidence}
            prediction={l1Prediction}
            challenge={L1}
          />
        </div>
      )}
      {stage === 'twist-predict' && (
        <PredictionScreen
          challenge={L1.twist}
          eyebrow="Twist · The open switch"
          coachLine="New circuit, same rule: predict first. If the model disagrees, I'll have one question for you."
          onComplete={handleTwistPredicted}
        />
      )}
      {stage === 'twist-build' && twistPrediction !== null && (
        <div className="flex flex-col gap-4">
          <PredictionSummary prediction={twistPrediction} hint={L1.twist.fix.hint} />
          <CircuitCanvas
            key="twist"
            seed={L1.twist.seed}
            eyebrow="Twist · The open switch"
            choice={twistPrediction.choice}
            claim={L1.twist.claim}
            coachSession={twistSession}
            onSolved={handleTwistSolved}
            onDirty={handleDirty}
            onVerdict={handleTwistVerdict}
            onCoachDone={handleTwistCoached}
            onEvidence={handleEvidence}
            prediction={twistPrediction}
            challenge={L1.twist}
          />
        </div>
      )}
      {stage === 'transfer-predict' && (
        <div className="flex flex-col gap-4">
          <div className="glass-panel p-4" role="note">
            <p className="text-sm text-ink-muted">
              Solo mode — the AI coach is off for this challenge. Trust your reasoning.
            </p>
          </div>
          <PredictionScreen
            challenge={TRANSFER}
            eyebrow="Solo · The second bulb"
            continueLabel="Continue to wire it"
            onComplete={setTransferPrediction}
          />
        </div>
      )}
      {stage === 'transfer-build' && transferPrediction !== null && (
        <div className="flex flex-col gap-4">
          <PredictionSummary prediction={transferPrediction} hint={TRANSFER.fix.hint} />
          <div className="glass-panel p-4" role="note">
            <p className="text-sm text-ink-muted">
              Solo mode — the AI coach is off for this challenge. Predict, build, and check
              against the simulator.
            </p>
          </div>
          <CircuitCanvas
            key="transfer"
            seed={TRANSFER.seed}
            eyebrow="Solo · The second bulb"
            choice={transferPrediction.choice}
            claim={TRANSFER.claim}
            onSolved={handleTransferSolved}
            onDirty={handleDirty}
            onEvidence={handleEvidence}
            prediction={transferPrediction}
            challenge={TRANSFER}
            solo
          />
        </div>
      )}
      {stage === 'finale' && <JourneyFinale chapters={finaleChapters} />}
      {STAGE_CONTENT[stage] /* exhaustiveness: every stage renders above */}
    </JourneyShell>
  )
}
