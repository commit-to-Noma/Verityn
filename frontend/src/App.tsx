import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import ChapterComplete from './components/ChapterComplete'
import JourneyFinale from './components/JourneyFinale'

/** Canvas weight splits out: stages show a brief fallback while it loads. */
const CircuitCanvas = lazy(() => import('./components/CircuitCanvas'))
const CANVAS_FALLBACK = <p className="text-ink-muted text-sm">Preparing the workbench…</p>
import type { ChapterRecap } from './journey/story'
import JourneyShell from './components/JourneyShell'
import HealthStatus from './components/HealthStatus'
import LabIntro from './components/LabIntro'
import PredictionScreen from './components/PredictionScreen'

/** Drawer-only weight: split out so the first paint stays lean. */
const SimulatePanel = lazy(() => import('./components/SimulatePanel'))
const EvaluatePanel = lazy(() => import('./components/EvaluatePanel'))
const SnapBuildLab = lazy(() => import('./components/SnapBuildLab'))
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

type Chapter = 'l1' | 'reality' | 'transfer'

interface ChapterGate {
  chapter: Chapter
  title: string
  detail: string
  nextLabel: string
  advance: () => void
  /** Reality-check only: the model disagreed, so the coach is invited in. */
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
  'reality-predict': null,
  'reality-build': null,
  'transfer-predict': null,
  'transfer-build': null,
  finale: null,
}

export default function App() {
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [entered, setEntered] = useState(false)
  const [l1Prediction, setL1Prediction] = useState<Prediction | null>(null)
  const [realityStarted, setRealityStarted] = useState(false)
  const [realityPrediction, setRealityPrediction] = useState<Prediction | null>(null)
  const [realitySession, setRealitySession] = useState<string | null>(null)
  const [transferStarted, setTransferStarted] = useState(false)
  const [transferPrediction, setTransferPrediction] = useState<Prediction | null>(null)
  const [transferDone, setTransferDone] = useState(false)
  const [snapshots, setSnapshots] = useState<Record<string, TraceInput>>({})
  const [complete, setComplete] = useState<ChapterGate | null>(null)
  const [auto, setAuto] = useState(() => new URLSearchParams(window.location.search).has('auto'))
  const [autoPending, setAutoPending] = useState(false)
  const [lensPage, setLensPage] = useState(false)
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
            nextLabel: 'Continue to Reality Check →',
            advance: () => setRealityStarted(true),
          },
          ADVANCE_BEAT_MS,
        )
      }
    },
    [showGate],
  )

  const handleRealitySolved = useCallback(
    (result: SimulateResult) => {
      if (matchesExpected(result, L1.twist.expectedFixed)) {
        showGate(
          {
            chapter: 'reality',
            title: 'Reality check complete',
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

  /** A contradicted reality check invites the coach in; the gate stays passable. */
  const handleRealityVerdict = useCallback(
    (status: VerdictStatus) => {
      if (status !== 'CONTRADICTED') {
        return
      }
      cancelAdvance()
      setComplete((gate) =>
        gate?.chapter === 'reality'
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

  const handleRealityCoached = useCallback(() => {
    if (complete?.chapter !== 'reality' || complete.coach !== 'invited') {
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
    realityStarted,
    realityPrediction: realityPrediction !== null,
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

  /** Reality Lens is a first-class workspace, not a footer tool. */
  const jumpToLens = useCallback(() => {
    setLensPage(true)
  }, [])

  const handleExploreLens = useCallback(() => {
    jumpToLens()
  }, [jumpToLens])

  const handleAutoToggle = useCallback(
    (checked: boolean) => {
      if (!checked) {
        cancelAdvance()
      }
      setAuto(checked)
    },
    [cancelAdvance],
  )

  const handleRealityPredicted = (prediction: Prediction) => {
    setRealityPrediction(prediction)
    void (async () => {
      try {
        const recorded = await recordPrediction(
          prediction.lessonId,
          prediction.choice,
          prediction.why,
        )
        setRealitySession(recorded.session_id)
      } catch {
        // The reality-check flow never blocks on coach recording; Ask the coach
        // explains the missing session if the learner tries it.
        setRealitySession(null)
      }
    })()
  }

  // All three slots, always: skipped chapters render an honest placeholder.
  const finaleChapters: ChapterRecap[] = [
    { id: L1.id, title: L1.title, solo: false, input: snapshots[L1.id] ?? null },
    { id: L1.twist.id, title: L1.twist.title, solo: false, input: snapshots[L1.twist.id] ?? null },
    { id: TRANSFER.id, title: TRANSFER.title, solo: true, input: snapshots[TRANSFER.id] ?? null },
  ]

  const developerTools = (
    <div className="flex flex-col gap-4">
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={auto}
          onChange={(event) => handleAutoToggle(event.target.checked)}
          className="h-5 w-5 accent-flow"
        />
        <span>
          Auto-advance chapters
          <span className="text-ink-muted"> — demo mode (also `?auto=1`)</span>
        </span>
      </label>
      <p className="text-ink-muted text-sm">
        Demo mode lets the presenter rehearse the journey without changing the learner
        experience.
      </p>
      <details className="border-glass-border rounded-[10px] border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Developer API benches</summary>
        <div className="mt-4 flex flex-col gap-4">
          <SimulatePanel preset={preset} onSelectPreset={setPresetId} />
          <EvaluatePanel key={preset.id} preset={preset} />
        </div>
      </details>
    </div>
  )

  if (lensPage) {
    return (
      <JourneyShell stage="intro" auto={auto} tools={developerTools}>
        <div className="flex flex-col gap-6">
          <button
            type="button"
            onClick={() => setLensPage(false)}
            className="border-glass-border min-h-[44px] w-fit rounded-[10px] border px-4 text-sm font-medium"
          >
            ← Back to guided journey
          </button>
          <section aria-labelledby="lens-page-heading" className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-flow">
                Meta vision workspace
              </p>
              <h1 id="lens-page-heading" className="text-3xl font-semibold tracking-tight">
                Reality Lens
              </h1>
              <p className="max-w-2xl text-base text-ink-muted">
                Turn a diagram into an experiment. Review what the vision model proposes,
                correct the circuit yourself, then confirm it before the simulator runs.
              </p>
              <div className="flex items-center gap-2">
                <HealthStatus compact />
              </div>
            </div>
            <Suspense fallback={<p className="text-ink-muted text-sm">Preparing Reality Lens…</p>}>
              <SnapBuildLab />
            </Suspense>
          </section>
        </div>
      </JourneyShell>
    )
  }

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
      nav={
        <div className="border-glass-border flex flex-wrap items-center gap-x-5 gap-y-1 border-y py-1 text-sm">
          <button
            type="button"
            onClick={jumpToLens}
            className="text-flow min-h-[44px] font-medium underline-offset-4 hover:underline"
          >
            Reality Lens: turn a diagram into an experiment
          </button>
          <label className="text-ink-muted ml-auto flex min-h-[44px] cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={auto}
              onChange={(event) => handleAutoToggle(event.target.checked)}
              className="accent-flow h-5 w-5"
            />
            Auto-demo
          </label>
        </div>
      }
      tools={
        <Suspense fallback={<p className="text-ink-muted text-sm">Preparing presenter controls…</p>}>
          {developerTools}
        </Suspense>
      }
    >
      {stage === 'intro' && (
        <LabIntro
          onEnter={() => setEntered(true)}
          onExploreLens={handleExploreLens}
          onDemo={() => {
            setAuto(true)
            setEntered(true)
          }}
        />
      )}
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
          <Suspense fallback={CANVAS_FALLBACK}>
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
          </Suspense>
        </div>
      )}
      {stage === 'reality-predict' && (
        <PredictionScreen
          challenge={L1.twist}
          eyebrow="Reality Check · The open switch"
          coachLine="New circuit, same rule: predict first. If the model disagrees, I'll have one question for you."
          onComplete={handleRealityPredicted}
        />
      )}
      {stage === 'reality-build' && realityPrediction !== null && (
        <div className="flex flex-col gap-4">
          <PredictionSummary prediction={realityPrediction} hint={L1.twist.fix.hint} />
          <Suspense fallback={CANVAS_FALLBACK}>
          <CircuitCanvas
            key="reality"
            seed={L1.twist.seed}
            eyebrow="Reality Check · The open switch"
            instructions="The loop is fully wired and the switch is open. We will test it right away — don't change the switch."
            choice={realityPrediction.choice}
            claim={L1.twist.claim}
            coachSession={realitySession}
            onSolved={handleRealitySolved}
            onDirty={handleDirty}
            onVerdict={handleRealityVerdict}
            onCoachDone={handleRealityCoached}
            onCoachInteract={handleInteract}
            onEvidence={handleEvidence}
            prediction={realityPrediction}
            challenge={L1.twist}
            autoDemonstrate={auto}
            gate={complete?.chapter === 'reality' ? gateNode : null}
          />
          </Suspense>
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
          <Suspense fallback={CANVAS_FALLBACK}>
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
          </Suspense>
        </div>
      )}
      {stage === 'finale' && (
        <JourneyFinale
          chapters={finaleChapters}
          onReturnHub={() => {
            window.location.href = window.location.pathname
          }}
          onExploreLens={() => {
            jumpToLens()
          }}
        />
      )}
      {STAGE_CONTENT[stage] /* exhaustiveness: every stage renders above */}
    </JourneyShell>
  )
}
