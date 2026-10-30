import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChapterComplete from './components/ChapterComplete'
import JourneyFinale from './components/JourneyFinale'
import DemoBar from './demo/DemoBar'
import type { DemoBeat, DemoState } from './demo/machine'
import { IDLE_DEMO, demoTransition } from './demo/machine'
import { DEMO_SCRIPT } from './demo/script'

/** Canvas weight splits out: stages show a brief fallback while it loads. */
const CircuitCanvas = lazy(() => import('./components/CircuitCanvas'))
const CANVAS_FALLBACK = <p className="text-ink-muted text-sm">Preparing the workbench…</p>
import type { ChapterRecap } from './journey/story'
import JourneyShell from './components/JourneyShell'
import HealthStatus from './components/HealthStatus'
import LabIntro from './components/LabIntro'
import PredictionScreen, { type PredictionDemo } from './components/PredictionScreen'

/** Drawer-only weight: split out so the first paint stays lean. */
const SimulatePanel = lazy(() => import('./components/SimulatePanel'))
const EvaluatePanel = lazy(() => import('./components/EvaluatePanel'))
const SnapBuildLab = lazy(() => import('./components/SnapBuildLab'))
const ExperimentPage = lazy(() => import('./experiment/ExperimentPage'))
import type { SimulateResult, VerdictStatus } from './api/client'
import { recordPrediction } from './api/client'
import { PRESETS } from './data/presets'
import { L1 } from './lessons/l1'
import { TRANSFER } from './lessons/transfer'
import type { Prediction } from './lessons/lesson'
import { matchesExpected } from './lessons/lesson'
import type { CoachTraceOutcome, TraceInput } from './lessons/trace'
import { shellLocation, stageFor, type ShellLocation, type Stage } from './journey/stages'

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
  const [experimentPage, setExperimentPage] = useState(false)
  /** Guided demo: a visible product mode above the `?auto=1` presenter timers. */
  const [demo, setDemo] = useState<DemoState>(IDLE_DEMO)
  const preset = PRESETS.find((option) => option.id === presetId) ?? PRESETS[0]

  const advanceTimer = useRef<number | null>(null)
  const autoRef = useRef(auto)
  const demoRef = useRef(demo)
  const completeRef = useRef(complete)
  /** Pre-demo auto switch, restored when the demo ends or hands over. */
  const autoBeforeDemo = useRef(false)
  /** The demo gate waits for R4; the presenter fallback keeps its old beat. */
  const realityR4 = useRef(false)
  useEffect(() => {
    autoRef.current = auto
    demoRef.current = demo
    completeRef.current = complete
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
      if (!demoRef.current.active) {
        document
          .querySelector('[aria-label="Evidence trace"]')
          ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
      }
      // A paused demo latches the gate but arms nothing; resume re-arms it.
      if (autoRef.current && !demoRef.current.paused) {
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

  /** Demo beat helper: silent outside the demo, forward-only inside it. */
  const advanceDemoBeat = useCallback((beat: DemoBeat) => {
    if (!demoRef.current.active) {
      return
    }
    setDemo((current) => demoTransition(current, { type: 'advanced', beat }))
  }, [])

  const handleContinue = useCallback(() => {
    if (complete === null) {
      return
    }
    cancelAdvance()
    setComplete(null)
    complete.advance()
  }, [cancelAdvance, complete])

  const handleEvidence = useCallback(
    (chapterId: string, input: TraceInput) => {
      setSnapshots((current) => ({ ...current, [chapterId]: input }))
      // The demonstration beat is real trace evidence, not a demo flag.
      if (
        demoRef.current.active &&
        chapterId === L1.twist.id &&
        input.demonstrations?.some((event) => event.phase === 'applied') === true
      ) {
        setDemo((current) => demoTransition(current, { type: 'advanced', beat: 'demonstrate' }))
      }
    },
    [],
  )

  const handleL1Solved = useCallback(
    (result: SimulateResult) => {
      if (matchesExpected(result, L1.expectedFixed)) {
        showGate(
          {
            chapter: 'l1',
            title: 'Reality check passed',
            detail: 'Your circuit matches the expected result. Study the evidence, then continue.',
            nextLabel: 'Continue to Reality Check →',
            advance: () => {
              setRealityStarted(true)
              advanceDemoBeat('reality')
            },
          },
          ADVANCE_BEAT_MS,
        )
      }
    },
    [showGate, advanceDemoBeat],
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
            advance: () => {
              setTransferStarted(true)
              advanceDemoBeat('solo')
            },
          },
          ADVANCE_BEAT_MS,
        )
      }
    },
    [showGate, advanceDemoBeat],
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
            advance: () => {
              setTransferDone(true)
              if (demoRef.current.active) {
                setDemo((current) => demoTransition(current, { type: 'finish' }))
              }
            },
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
              title: 'Prediction did not match',
              detail: 'Ask the coach above, then continue when ready.',
              coach: 'invited',
            }
          : gate,
      )
      advanceDemoBeat('coach')
    },
    [cancelAdvance, advanceDemoBeat],
  )

  const handleRealityCoached = useCallback(
    (outcome?: CoachTraceOutcome) => {
      if (complete?.chapter !== 'reality') {
        return
      }
      if (!demoRef.current.active) {
        // Presenter fallback, unchanged: the first heard rung starts the beat.
        if (complete.coach !== 'invited') {
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
        return
      }
      // Guided demo: the full ladder plays, and only R4 may advance the gate.
      if (complete.coach === 'invited') {
        setComplete({
          ...complete,
          title: 'Coach heard',
          detail: 'Continue when ready.',
          coach: 'heard',
        })
      }
      if (outcome?.phase === 'done' && outcome.rung === 'R4') {
        realityR4.current = true
        if (!demoRef.current.paused) {
          cancelAdvance()
          setAutoPending(true)
          advanceTimer.current = window.setTimeout(() => {
            advanceTimer.current = null
            setAutoPending(false)
            setComplete(null)
            complete.advance()
          }, COACHED_BEAT_MS)
        }
      }
    },
    [cancelAdvance, complete],
  )

  /** Edits cancel a pending demo timer; the latched gate stays passable. */
  const handleDirty = useCallback(() => {
    cancelAdvance()
  }, [cancelAdvance])

  /** Reflection typing cancels a pending demo timer, like any edit. */
  const handleInteract = useCallback(() => {
    cancelAdvance()
  }, [cancelAdvance])

  const resetJourney = useCallback(() => {
    cancelAdvance()
    setL1Prediction(null)
    setRealityStarted(false)
    setRealityPrediction(null)
    setRealitySession(null)
    setTransferStarted(false)
    setTransferPrediction(null)
    setTransferDone(false)
    setSnapshots({})
    setComplete(null)
    realityR4.current = false
  }, [cancelAdvance])

  /** Enter the guided demo: a clean journey that performs itself. */
  const startDemo = useCallback(() => {
    if (!demoRef.current.active) {
      autoBeforeDemo.current = autoRef.current
    }
    resetJourney()
    setAuto(true)
    setLensPage(false)
    setExperimentPage(false)
    setEntered(true)
    setDemo((current) => demoTransition(current, { type: 'start' }))
  }, [resetJourney])

  /** Leave demo mode, keep the journey exactly where it stands. */
  const endDemoToManual = useCallback(() => {
    if (!demoRef.current.active) {
      return
    }
    cancelAdvance()
    setAuto(autoBeforeDemo.current)
    setDemo((current) => demoTransition(current, { type: 'takeover' }))
  }, [cancelAdvance])

  const handleDemoPause = useCallback(() => {
    cancelAdvance()
    setDemo((current) => demoTransition(current, { type: 'pause' }))
  }, [cancelAdvance])

  const handleDemoResume = useCallback(() => {
    setDemo((current) => demoTransition(current, { type: 'resume' }))
    // Re-arm a gate timer the pause cancelled  -  but never one the coach
    // invite legitimately holds for the ladder.
    const gate = completeRef.current
    if (demoRef.current.active && gate !== null && gate.coach !== 'invited') {
      showGate(gate, ADVANCE_BEAT_MS)
    }
  }, [showGate])

  const handleDemoSkip = useCallback(() => {
    const state = demoRef.current
    if (!state.active || state.complete) {
      return
    }
    // While the ladder is still open, skip only hurries its pending beat;
    // the gate advance is a later beat, never the same one.
    const ladderOpen =
      (state.beat === 'reality' || state.beat === 'coach' || state.beat === 'demonstrate') &&
      !realityR4.current
    if (!ladderOpen && completeRef.current !== null) {
      handleContinue()
      return
    }
    setDemo((current) => demoTransition(current, { type: 'skip' }))
  }, [handleContinue])

  const handleDemoExit = useCallback(() => {
    endDemoToManual()
    resetJourney()
    setLensPage(false)
    setExperimentPage(false)
    setEntered(false)
  }, [endDemoToManual, resetJourney])

  const handleDemoManual = useCallback(() => {
    endDemoToManual()
    resetJourney()
    setLensPage(false)
    setExperimentPage(false)
    setEntered(true)
  }, [endDemoToManual, resetJourney])

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

  /** Reality Lens is a first-class workspace, not a footer tool. Leaving the
   * journey unmounts the canvases, so any latched gate is cleared: builds must
   * be re-verified on return, while recorded predictions stand. */
  const jumpToLens = useCallback(() => {
    endDemoToManual()
    cancelAdvance()
    setComplete(null)
    setExperimentPage(false)
    setLensPage(true)
  }, [cancelAdvance, endDemoToManual])

  const location = shellLocation(entered, lensPage, experimentPage)

  /** Persistent shell navigation. Recorded predictions stand, but any latched
   * gate is cleared: leaving unmounts the canvases, so builds are re-verified
   * on return rather than advancing on unseen evidence. */
  const handleNavigate = useCallback(
    (target: ShellLocation) => {
      endDemoToManual()
      cancelAdvance()
      setComplete(null)
      if (target === 'lens') {
        setExperimentPage(false)
        setLensPage(true)
      } else if (target === 'experiment') {
        setLensPage(false)
        setExperimentPage(true)
      } else if (target === 'lab') {
        setLensPage(false)
        setExperimentPage(false)
        setEntered(true)
      } else {
        setLensPage(false)
        setExperimentPage(false)
        setEntered(false)
      }
    },
    [cancelAdvance, endDemoToManual],
  )

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

  const handleL1Predicted = (prediction: Prediction) => {
    setL1Prediction(prediction)
    advanceDemoBeat('build')
  }

  const handleRealityPredicted = (prediction: Prediction) => {
    setRealityPrediction(prediction)
    realityR4.current = false
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

  // Scripted predictions, one stable object per stage: only active/paused/
  // signal re-create them, so unrelated renders never restart demo beats.
  const l1Demo = useMemo<PredictionDemo | undefined>(
    () =>
      demo.active
        ? {
            choice: DEMO_SCRIPT.firstPrediction.choice,
            why: DEMO_SCRIPT.firstPrediction.why,
            paused: demo.paused,
            signal: demo.signal,
            onTakeover: endDemoToManual,
          }
        : undefined,
    [demo.active, demo.paused, demo.signal, endDemoToManual],
  )
  const realityDemo = useMemo<PredictionDemo | undefined>(
    () =>
      demo.active
        ? {
            choice: DEMO_SCRIPT.realityPrediction.choice,
            why: DEMO_SCRIPT.realityPrediction.why,
            paused: demo.paused,
            signal: demo.signal,
            onTakeover: endDemoToManual,
          }
        : undefined,
    [demo.active, demo.paused, demo.signal, endDemoToManual],
  )
  const transferDemo = useMemo<PredictionDemo | undefined>(
    () =>
      demo.active
        ? {
            choice: DEMO_SCRIPT.soloPrediction.choice,
            why: DEMO_SCRIPT.soloPrediction.why,
            paused: demo.paused,
            signal: demo.signal,
            onTakeover: endDemoToManual,
          }
        : undefined,
    [demo.active, demo.paused, demo.signal, endDemoToManual],
  )

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
          <span className="text-ink-muted">  -  demo mode (also `?auto=1`)</span>
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
      <JourneyShell stage="intro" auto={auto} tools={developerTools} location="lens" onNavigate={handleNavigate} wide>
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
              <SnapBuildLab onReturnToLab={() => handleNavigate('lab')} />
            </Suspense>
          </section>
        </div>
      </JourneyShell>
    )
  }

  if (experimentPage) {
    return (
      <JourneyShell stage="intro" auto={false} tools={developerTools} location="experiment" onNavigate={handleNavigate} wide>
        <div className="flex flex-col gap-6">
          <section aria-labelledby="experiment-page-heading" className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-flow">
                Free bench
              </p>
              <h1 id="experiment-page-heading" className="text-3xl font-semibold tracking-tight">
                Experiment Bay
              </h1>
              <div className="flex items-center gap-2">
                <HealthStatus compact />
              </div>
            </div>
            <Suspense fallback={<p className="text-ink-muted text-sm">Preparing the workbench…</p>}>
              <ExperimentPage onReturnToLab={() => handleNavigate('lab')} />
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

  const demoBar = (
    <DemoBar
      demo={demo}
      onPause={handleDemoPause}
      onResume={handleDemoResume}
      onSkip={handleDemoSkip}
      onReplay={startDemo}
      onManual={handleDemoManual}
      onExit={handleDemoExit}
    />
  )

  return (
    <JourneyShell
      stage={stage}
      auto={auto && !demo.active}
      location={location}
      onNavigate={handleNavigate}
      demoBar={demoBar}
      demoActive={demo.active}
      wide
      tools={
        <Suspense fallback={<p className="text-ink-muted text-sm">Preparing presenter controls…</p>}>
          {developerTools}
        </Suspense>
      }
    >
      {stage === 'intro' && (
        <LabIntro
          onEnter={() => setEntered(true)}
          onExperiment={() => handleNavigate('experiment')}
          onExploreLens={handleExploreLens}
          onDemo={startDemo}
        />
      )}
      {stage === 'l1-predict' && (
        <PredictionScreen
          challenge={L1}
          eyebrow="Predict · Light the bulb"
          coachLine="I'm your coach. Commit to a prediction first  -  I stay quiet until you've tested it."
          onComplete={handleL1Predicted}
          demo={l1Demo}
        />
      )}
      {stage === 'l1-build' && l1Prediction !== null && (
        <div className="flex flex-col gap-4">
          <Suspense fallback={CANVAS_FALLBACK}>
          <CircuitCanvas
            key="l1"
            seed={L1.seed}
            eyebrow="Build · Light the bulb"
            instructions="Connect the two glowing terminal dots to complete the loop."
            onSolved={handleL1Solved}
            onDirty={handleDirty}
            onEvidence={handleEvidence}
            layout="split"
            prediction={l1Prediction}
            challenge={L1}
            demoBuild={demo.active ? DEMO_SCRIPT.l1Build : null}
            demoPaused={demo.paused}
            demoSignal={demo.signal}
            onDemoTakeover={endDemoToManual}
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
          demo={realityDemo}
        />
      )}
      {stage === 'reality-build' && realityPrediction !== null && (
        <div className="flex flex-col gap-4">
          <Suspense fallback={CANVAS_FALLBACK}>
          <CircuitCanvas
            key="reality"
            seed={L1.twist.seed}
            eyebrow="Reality Check · The open switch"
            instructions="The loop is fully wired and the switch is open. We will test it right away  -  don't change the switch."
            choice={realityPrediction.choice}
            claim={L1.twist.claim}
            coachSession={realitySession}
            onSolved={handleRealitySolved}
            onDirty={handleDirty}
            onVerdict={handleRealityVerdict}
            onCoachDone={handleRealityCoached}
            onCoachInteract={handleInteract}
            onEvidence={handleEvidence}
            layout="split"
            prediction={realityPrediction}
            challenge={L1.twist}
            autoDemonstrate={auto && !demo.paused}
            autoAsk={demo.active && !demo.paused}
            demoSignal={demo.signal}
            demoAutoUndo={demo.active && !demo.paused}
            onDemoTakeover={endDemoToManual}
            gate={complete?.chapter === 'reality' ? gateNode : null}
          />
          </Suspense>
        </div>
      )}
      {stage === 'transfer-predict' && (
        <div className="flex flex-col gap-4">
          <div className="glass-panel p-4" role="note">
            <p className="text-sm text-ink-muted">
              Solo mode  -  the AI coach is off for this challenge. Trust your reasoning.
            </p>
          </div>
          <PredictionScreen
            challenge={TRANSFER}
            eyebrow="Solo · The second bulb"
            continueLabel="Continue to wire it"
            onComplete={setTransferPrediction}
            demo={transferDemo}
          />
        </div>
      )}
      {stage === 'transfer-build' && transferPrediction !== null && (
        <div className="flex flex-col gap-4">
          <div className="glass-panel p-4" role="note">
            <p className="text-sm text-ink-muted">
              Solo mode  -  the AI coach is off for this challenge. Predict, build, and check
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
            layout="split"
            prediction={transferPrediction}
            challenge={TRANSFER}
            solo
            demoBuild={demo.active ? DEMO_SCRIPT.soloBuild : null}
            demoPaused={demo.paused}
            demoSignal={demo.signal}
            onDemoTakeover={endDemoToManual}
            gate={complete?.chapter === 'transfer' ? gateNode : null}
          />
          </Suspense>
        </div>
      )}
      {stage === 'finale' && (
        <JourneyFinale
          chapters={finaleChapters}
          onTryLab={handleDemoManual}
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
