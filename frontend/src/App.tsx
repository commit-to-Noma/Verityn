import { useCallback, useEffect, useRef, useState } from 'react'
import ChapterComplete from './components/ChapterComplete'
import CircuitCanvas from './components/CircuitCanvas'
import EvaluatePanel from './components/EvaluatePanel'
import JourneyFinale from './components/JourneyFinale'
import type { ChapterRecap } from './journey/story'
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

/** Demo-mode auto-advance delays; manual mode shows the gate with no timer. */
const ADVANCE_BEAT_MS = 4000
const COACHED_BEAT_MS = 2000

type Chapter = 'l1' | 'twist' | 'transfer'

interface ChapterGate {
  chapter: Chapter
  title: string
  detail: string
  nextLabel: string
  advance: () => void
  /** Twist only: the model disagreed, so the coach is invited in. */
  coach?: 'invited' | 'heard'
}

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
  const [complete, setComplete] = useState<ChapterGate | null>(null)
  const [auto, setAuto] = useState(() => new URLSearchParams(window.location.search).has('auto'))
  const [autoPending, setAutoPending] = useState(false)
  const preset = PRESETS.find((option) => option.id === presetId) ?? PRESETS[0]

  const advanceTimer = useRef<number | null>(null)
  const autoRef = useRef(auto)
  useEffect(() => {
    autoRef.current = auto
  })

  const cancelAdvance = useCallback(() => {
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current)
      advanceTimer.current = null
    }
    setAutoPending(false)
  }, [])

  useEffect(
    () => () => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current)
        advanceTimer.current = null
      }
    },
    [],
  )

  const showGate = useCallback(
    (gate: ChapterGate, delay: number) => {
      cancelAdvance()
      setComplete(gate)
      document
        .querySelector('[aria-label="Evidence trace"]')
        ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
      if (autoRef.current) {
        setAutoPending(true)
        advanceTimer.current = window.setTimeout(() => {
          advanceTimer.current = null
          setAutoPending(false)
          setComplete(null)
          gate.advance()
        }, delay)
      }
    },
    [cancelAdvance],
  )

  const handleContinue = useCallback(() => {
    if (complete === null) {
      return
    }
    cancelAdvance()
    setComplete(null)
    complete.advance()
  }, [cancelAdvance, complete])

  const handleEvidence = useCallback((chapterId: string, input: TraceInput) => {
    setSnapshots((current) => ({ ...current, [chapterId]: input }))
  }, [])

  const handleL1Solved = useCallback(
    (result: SimulateResult) => {
      if (matchesExpected(result, L1.expectedFixed)) {
        showGate(
          {
            chapter: 'l1',
            title: 'Reality check passed',
            detail: 'Your circuit matches the expected result. Study the evidence, then continue.',
            nextLabel: 'Continue to Twist →',
            advance: () => setTwistStarted(true),
          },
          ADVANCE_BEAT_MS,
        )
      }
    },
    [showGate],
  )

  const handleTwistSolved = useCallback(
    (result: SimulateResult) => {
      if (matchesExpected(result, L1.twist.expectedFixed)) {
        showGate(
          {
            chapter: 'twist',
            title: 'Twist solved',
            detail: 'Your circuit matches the expected result. Study the evidence, then continue.',
            nextLabel: 'Continue to solo →',
            advance: () => setTransferStarted(true),
          },
          ADVANCE_BEAT_MS,
        )
      }
    },
    [showGate],
  )

  const handleTransferSolved = useCallback(
    (result: SimulateResult) => {
      if (matchesExpected(result, TRANSFER.expectedFixed)) {
        showGate(
          {
            chapter: 'transfer',
            title: 'Solo complete',
            detail: 'You solved it with the coach off. Review the evidence, then see your journey.',
            nextLabel: 'See your journey →',
            advance: () => setTransferDone(true),
          },
          ADVANCE_BEAT_MS,
        )
      }
    },
    [showGate],
  )

  /** A contradicted twist invites the coach in; the gate stays passable. */
  const handleTwistVerdict = useCallback(
    (status: VerdictStatus) => {
      if (status !== 'CONTRADICTED') {
        return
      }
      cancelAdvance()
      setComplete((gate) =>
        gate?.chapter === 'twist'
          ? {
              ...gate,
              title: 'The model disagrees',
              detail: 'Ask the coach above, then continue when ready.',
              coach: 'invited',
            }
          : gate,
      )
    },
    [cancelAdvance],
  )

  const handleTwistCoached = useCallback(() => {
    if (complete?.chapter !== 'twist' || complete.coach !== 'invited') {
      return
    }
    setComplete({
      ...complete,
      title: 'Coach heard',
      detail: 'Continue when ready.',
      coach: 'heard',
    })
    if (autoRef.current) {
      cancelAdvance()
      setAutoPending(true)
      advanceTimer.current = window.setTimeout(() => {
        advanceTimer.current = null
        setAutoPending(false)
        setComplete(null)
        complete.advance()
      }, COACHED_BEAT_MS)
    }
  }, [cancelAdvance, complete])

  /** Edits cancel a pending demo timer; the latched gate stays passable. */
  const handleDirty = useCallback(() => {
    cancelAdvance()
  }, [cancelAdvance])

  /** Reflection typing cancels a pending demo timer, like any edit. */
  const handleInteract = useCallback(() => {
    cancelAdvance()
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

  const gateNode =
    complete === null ? null : (
      <ChapterComplete
        title={complete.title}
        detail={complete.detail}
        nextLabel={complete.nextLabel}
        auto={autoPending}
        onContinue={handleContinue}
      />
    )

  return (
    <JourneyShell
      stage={stage}
      auto={auto}
      tools={
        <>
          <section aria-label="Learner tools" className="flex flex-col gap-2">
            <h3 className="text-base font-semibold">Learner tools</h3>
            <p className="text-ink-muted text-sm">
              The guided journey above is the learner path — predict, build, and check against
              the simulator. Everything in this drawer is optional.
            </p>
          </section>
          <section aria-label="Vision experiment (Reality Lens)" className="flex flex-col gap-4">
            <h3 className="text-base font-semibold">Vision experiment (Reality Lens)</h3>
            <SnapBuildLab />
          </section>
          <section aria-label="Judge / debug tools" className="flex flex-col gap-4">
            <h3 className="text-base font-semibold">Judge / debug tools</h3>
            <label className="flex cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={auto}
                onChange={(event) => {
                  if (!event.target.checked) {
                    cancelAdvance()
                  }
                  setAuto(event.target.checked)
                }}
                className="h-5 w-5 accent-flow"
              />
              <span>
                Auto-advance chapters
                <span className="text-ink-muted"> — demo mode (also `?auto=1`)</span>
              </span>
            </label>
            <div className="flex flex-col gap-4">
              <h4 className="text-sm font-semibold">API benches</h4>
              <SimulatePanel preset={preset} onSelectPreset={setPresetId} />
              <EvaluatePanel key={preset.id} preset={preset} />
            </div>
          </section>
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
            instructions="Connect the two glowing terminal dots to complete the loop."
            onSolved={handleL1Solved}
            onDirty={handleDirty}
            onEvidence={handleEvidence}
            prediction={l1Prediction}
            challenge={L1}
            gate={complete?.chapter === 'l1' ? gateNode : null}
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
            instructions="The loop is fully wired and the switch is open. We will test it right away — don't change the switch."
            choice={twistPrediction.choice}
            claim={L1.twist.claim}
            coachSession={twistSession}
            onSolved={handleTwistSolved}
            onDirty={handleDirty}
            onVerdict={handleTwistVerdict}
            onCoachDone={handleTwistCoached}
            onCoachInteract={handleInteract}
            onEvidence={handleEvidence}
            prediction={twistPrediction}
            challenge={L1.twist}
            gate={complete?.chapter === 'twist' ? gateNode : null}
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
            instructions="Connect the second bulb across L1's two terminals. We will test the circuit as soon as the loop closes."
            choice={transferPrediction.choice}
            claim={TRANSFER.claim}
            onSolved={handleTransferSolved}
            onDirty={handleDirty}
            onEvidence={handleEvidence}
            prediction={transferPrediction}
            challenge={TRANSFER}
            solo
            gate={complete?.chapter === 'transfer' ? gateNode : null}
          />
        </div>
      )}
      {stage === 'finale' && (
        <JourneyFinale
          chapters={finaleChapters}
          onReturnHub={() => {
            window.location.href = window.location.pathname
          }}
          onExploreLens={() => {
            const tools = document.querySelector('#lab-tools')
            if (tools instanceof HTMLDetailsElement) {
              tools.open = true
            }
            document
              .querySelector('#snap-build-heading')
              ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
          }}
        />
      )}
      {STAGE_CONTENT[stage] /* exhaustiveness: every stage renders above */}
    </JourneyShell>
  )
}
