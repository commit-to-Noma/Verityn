import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChapterComplete from './components/ChapterComplete'
import DemoBar from './demo/DemoBar'
import type { DemoBeat, DemoState } from './demo/machine'
import { IDLE_DEMO, demoTransition } from './demo/machine'
import { DEMO_SCRIPT } from './demo/script'

/** Canvas weight splits out: stages show a brief fallback while it loads. */
const CircuitCanvas = lazy(() => import('./components/CircuitCanvas'))
const CoachConversation = lazy(() => import('./voice/CoachConversation'))
const JourneyFinale = lazy(() => import('./components/JourneyFinale'))
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
import { createPrediction, LIT_POWER_W, matchesExpected } from './lessons/lesson'
import type { CoachTraceOutcome, TraceInput } from './lessons/trace'
import {
  showCoachText,
  speakCoach,
  stopCoach,
  subscribeCoachSpeechFinished,
} from './voice/coachVoice'
import { spokenPredictionChoice } from './voice/spokenPrediction'
import { shellLocation, stageFor, type ShellLocation, type Stage } from './journey/stages'
import { setTraceStage } from './trace/session'
import {
  JOURNEY_PROGRESS_VERSION,
  clearJourneyCheckpoint,
  readJourneyCheckpoint,
  saveJourneyCheckpoint,
  type CheckpointRead,
  type JourneyCheckpoint,
} from './journey/progressStorage'

/** Demo-mode auto-advance delays; manual mode shows the gate with no timer. */
const ADVANCE_BEAT_MS = 4000
const COACHED_BEAT_MS = 2000
const VOICE_ADVANCE_PAUSE_MS = 2200
const FINALE_ADVANCE_MS = 5500

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

function readBrowserCheckpoint(): CheckpointRead {
  try {
    return readJourneyCheckpoint(window.localStorage)
  } catch {
    return { status: 'unavailable', checkpoint: null }
  }
}

function saveBrowserCheckpoint(checkpoint: CheckpointRead['checkpoint']): boolean {
  if (checkpoint === null) {
    return false
  }
  try {
    return saveJourneyCheckpoint(window.localStorage, checkpoint)
  } catch {
    return false
  }
}

function clearBrowserCheckpoint(): boolean {
  try {
    return clearJourneyCheckpoint(window.localStorage)
  } catch {
    return false
  }
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

const COACH_INTRODUCTION =
  "Hi, I'm your coach. Predict first — then build the circuit and test it."

export default function App() {
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [entered, setEntered] = useState(false)
  const [coachVoiceEnabled, setCoachVoiceEnabled] = useState(false)
  const [learnerReply, setLearnerReply] = useState('')
  const [l1Prediction, setL1Prediction] = useState<Prediction | null>(null)
  const [realityStarted, setRealityStarted] = useState(false)
  const [realityPrediction, setRealityPrediction] = useState<Prediction | null>(null)
  const [realitySession, setRealitySession] = useState<string | null>(null)
  const [transferStarted, setTransferStarted] = useState(false)
  const [transferPrediction, setTransferPrediction] = useState<Prediction | null>(null)
  const [transferDone, setTransferDone] = useState(false)
  const [snapshots, setSnapshots] = useState<Record<string, TraceInput>>({})
  const [checkpointRead, setCheckpointRead] = useState(readBrowserCheckpoint)
  const [resumedCheckpoint, setResumedCheckpoint] = useState(false)
  const [complete, setComplete] = useState<ChapterGate | null>(null)
  const [auto, setAuto] = useState(() => new URLSearchParams(window.location.search).has('auto'))
  const [autoPending, setAutoPending] = useState(false)
  const [lensPage, setLensPage] = useState(false)
  const [experimentPage, setExperimentPage] = useState(false)
  /** Guided demo: a visible product mode above the `?auto=1` presenter timers. */
  const [demo, setDemo] = useState<DemoState>(IDLE_DEMO)
  const preset = PRESETS.find((option) => option.id === presetId) ?? PRESETS[0]

  const advanceTimer = useRef<number | null>(null)
  const voiceAdvanceCleanup = useRef<(() => void) | null>(null)
  const voiceAdvanceTimer = useRef(false)
  const autoRef = useRef(auto)
  const demoRef = useRef(demo)
  const completeRef = useRef(complete)
  const checkpointSaveFailed = useRef(false)
  /** Pre-demo auto switch, restored when the demo ends or hands over. */
  const autoBeforeDemo = useRef(false)
  /** The demo gate waits for R4; the presenter fallback keeps its old beat. */
  const realityR4 = useRef(false)
  const realityBulbLit = useRef<boolean | null>(null)
  useEffect(() => {
    autoRef.current = auto
    demoRef.current = demo
    completeRef.current = complete
  })

  useEffect(() => {
    if (demo.active) {
      checkpointSaveFailed.current = !clearBrowserCheckpoint()
      return
    }
    const hasJourney =
      entered ||
      l1Prediction !== null ||
      realityPrediction !== null ||
      transferPrediction !== null ||
      Object.keys(snapshots).length > 0
    if (!hasJourney) {
      return
    }
    const checkpoint: JourneyCheckpoint = {
      version: JOURNEY_PROGRESS_VERSION,
      savedAt: Date.now(),
      l1Prediction,
      realityStarted,
      realityPrediction,
      realitySession,
      transferStarted,
      transferPrediction,
      transferDone,
      snapshots,
    }
    checkpointSaveFailed.current = !saveBrowserCheckpoint(checkpoint)
  }, [
    demo.active,
    entered,
    l1Prediction,
    realityStarted,
    realityPrediction,
    realitySession,
    transferStarted,
    transferPrediction,
    transferDone,
    snapshots,
  ])

  const announceCoach = useCallback(
    (text: string) => {
      // Spoken playback is browser TTS, default off, and never part of the
      // guided demo: the demo shows captions so it films silently.
      if (coachVoiceEnabled && !demoRef.current.active) {
        return speakCoach(text)
      }
      showCoachText(text)
      return false
    },
    [coachVoiceEnabled],
  )

  const cancelAdvance = useCallback(() => {
    voiceAdvanceCleanup.current?.()
    voiceAdvanceCleanup.current = null
    voiceAdvanceTimer.current = false
    if (advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current)
      advanceTimer.current = null
    }
    setAutoPending(false)
  }, [])

  const cancelVoiceAdvance = useCallback(() => {
    const wasPending = voiceAdvanceCleanup.current !== null || voiceAdvanceTimer.current
    voiceAdvanceCleanup.current?.()
    voiceAdvanceCleanup.current = null
    if (voiceAdvanceTimer.current && advanceTimer.current !== null) {
      window.clearTimeout(advanceTimer.current)
      advanceTimer.current = null
    }
    voiceAdvanceTimer.current = false
    if (wasPending) {
      setAutoPending(false)
    }
  }, [])

  useEffect(() => {
    if (!coachVoiceEnabled) {
      cancelVoiceAdvance()
    }
  }, [coachVoiceEnabled, cancelVoiceAdvance])

  useEffect(
    () => () => {
      if (advanceTimer.current !== null) {
        window.clearTimeout(advanceTimer.current)
        advanceTimer.current = null
      }
      voiceAdvanceCleanup.current?.()
      voiceAdvanceCleanup.current = null
    },
    [],
  )

  const showGate = useCallback(
    (
      gate: ChapterGate,
      delay: number,
      advanceAfterSpeech = false,
      advanceAfterDelay = false,
    ) => {
      cancelAdvance()
      setComplete(gate)
      const advanceGate = () => {
        advanceTimer.current = null
        voiceAdvanceCleanup.current?.()
        voiceAdvanceCleanup.current = null
        voiceAdvanceTimer.current = false
        setAutoPending(false)
        setComplete(null)
        gate.advance()
      }
      // A paused demo latches the gate but arms nothing; resume re-arms it.
      if (autoRef.current && !demoRef.current.paused) {
        setAutoPending(true)
        advanceTimer.current = window.setTimeout(advanceGate, delay)
      } else if (advanceAfterSpeech && !demoRef.current.active) {
        let unsubscribe: () => void = () => undefined
        unsubscribe = subscribeCoachSpeechFinished(() => {
          unsubscribe()
          if (voiceAdvanceCleanup.current === unsubscribe) {
            voiceAdvanceCleanup.current = null
          }
          setAutoPending(true)
          voiceAdvanceTimer.current = true
          advanceTimer.current = window.setTimeout(advanceGate, VOICE_ADVANCE_PAUSE_MS)
        })
        voiceAdvanceCleanup.current = unsubscribe
      } else if (advanceAfterDelay && !demoRef.current.active) {
        setAutoPending(true)
        advanceTimer.current = window.setTimeout(advanceGate, delay)
      }
    },
    [cancelAdvance],
  )

  useEffect(() => {
    if (complete === null) {
      return
    }
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector('[aria-label="Chapter complete"]')
        ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [complete])

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
      const bulb = result.components.L1
      if (matchesExpected(result, L1.expectedFixed)) {
        const spoken = announceCoach(
          'The loop is complete and the bulb is lit. Check the simulator result; next we will test the open-switch case.',
        )
        showGate(
          {
            chapter: 'l1',
            title: 'Circuit test complete',
            detail: 'The loop is complete and the bulb is lit. The next test keeps the switch open.',
            nextLabel: 'Test with the switch open',
            advance: () => {
              announceCoach(
                'Now predict what will happen with the switch open. Will the bulb light?',
              )
              setRealityStarted(true)
              advanceDemoBeat('reality')
            },
          },
          ADVANCE_BEAT_MS,
          spoken,
        )
      } else {
        announceCoach(
          bulb !== undefined && bulb.power > LIT_POWER_W
            ? 'I see the bulb is lit, but this build is not complete yet. Check the open terminals and the full path, then test again.'
            : 'I see the bulb stayed dark. Check whether the switch is open and whether each wire completes one path, then test again.',
        )
      }
    },
    [showGate, advanceDemoBeat, announceCoach],
  )

  const handleRealitySolved = useCallback(
    (result: SimulateResult) => {
      const bulb = result.components.L1
      realityBulbLit.current = bulb !== undefined && bulb.power > LIT_POWER_W
      if (matchesExpected(result, L1.twist.expectedFixed)) {
        const spoken = announceCoach(
          'With the switch open, no current flows and the bulb stays off. The battery is still connected; the gap in the switch breaks the loop. Next, you will try a new circuit on your own in Solo.',
        )
        showGate(
          {
            chapter: 'reality',
            title: 'Reality check complete',
            detail: 'The open switch breaks the path, so the bulb stays off.',
            nextLabel: 'Start the Solo challenge',
            advance: () => {
              setTransferStarted(true)
              advanceDemoBeat('solo')
            },
          },
          ADVANCE_BEAT_MS,
          spoken,
        )
      } else {
        announceCoach(
          realityBulbLit.current
            ? 'I see the bulb lit, so current is flowing. For this test, leave the switch open, then test the circuit again.'
            : 'I see the bulb stayed dark. Compare that result with your prediction and check the switch before testing again.',
        )
      }
    },
    [showGate, advanceDemoBeat, announceCoach],
  )

  const handleTransferSolved = useCallback(
    (result: SimulateResult) => {
      if (matchesExpected(result, TRANSFER.expectedFixed)) {
        showGate(
          {
            chapter: 'transfer',
            title: 'Solo complete',
            detail: 'The Solo circuit is verified. View your completed journey to finish the lab.',
            nextLabel: 'View completed journey',
            advance: () => {
              setTransferDone(true)
              if (demoRef.current.active) {
                setDemo((current) => demoTransition(current, { type: 'finish' }))
              }
            },
          },
          FINALE_ADVANCE_MS,
          false,
          false,
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
      announceCoach(
        realityBulbLit.current
          ? 'The bulb lit, so current flowed. Compare that with your prediction and check that the switch is open for this test.'
          : 'The bulb stayed off with the switch open. Compare that result with your prediction.',
      )
      cancelAdvance()
      setComplete((gate) =>
        gate?.chapter === 'reality'
          ? {
              ...gate,
              title: 'Prediction did not match',
              detail:
                'Review the measurement. The coach is available for a hint, or you can continue on your own.',
              coach: 'invited',
            }
          : gate,
      )
      advanceDemoBeat('coach')
    },
    [cancelAdvance, advanceDemoBeat, announceCoach],
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

  /** Edits invalidate any result gate until the new circuit is tested. */
  const handleDirty = useCallback(() => {
    cancelAdvance()
    setComplete(null)
  }, [cancelAdvance])

  const handleResumeJourney = useCallback(() => {
    const checkpoint = checkpointRead.checkpoint
    if (checkpoint === null) {
      return
    }
    setL1Prediction(checkpoint.l1Prediction)
    setRealityStarted(checkpoint.realityStarted)
    setRealityPrediction(checkpoint.realityPrediction)
    setRealitySession(checkpoint.realitySession)
    setTransferStarted(checkpoint.transferStarted)
    setTransferPrediction(checkpoint.transferPrediction)
    setTransferDone(checkpoint.transferDone)
    setSnapshots(checkpoint.snapshots)
    setComplete(null)
    setEntered(true)
    setLensPage(false)
    setExperimentPage(false)
    setResumedCheckpoint(true)
  }, [checkpointRead.checkpoint])

  /** Reflection typing cancels a pending demo timer, like any edit. */
  const handleInteract = useCallback(() => {
    cancelAdvance()
  }, [cancelAdvance])

  const resetJourney = useCallback(() => {
    stopCoach()
    cancelAdvance()
    checkpointSaveFailed.current = !clearBrowserCheckpoint()
    setCheckpointRead({
      status: checkpointSaveFailed.current ? 'unavailable' : 'empty',
      checkpoint: null,
    })
    setResumedCheckpoint(false)
    setL1Prediction(null)
    setLearnerReply('')
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

  const handleStartJourney = useCallback(() => {
    resetJourney()
    setLensPage(false)
    setExperimentPage(false)
    setEntered(true)
    announceCoach(COACH_INTRODUCTION)
  }, [resetJourney, announceCoach])

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
    announceCoach(COACH_INTRODUCTION)
  }, [resetJourney, announceCoach])

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

  useEffect(() => {
    setTraceStage(lensPage ? 'lens' : experimentPage ? 'experiment' : stage)
  }, [lensPage, experimentPage, stage])

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
      if (target === 'hub') {
        setCheckpointRead(
          checkpointSaveFailed.current
            ? { status: 'unavailable', checkpoint: null }
            : readBrowserCheckpoint(),
        )
      }
      if (target === 'lens') {
        setExperimentPage(false)
        setLensPage(true)
      } else if (target === 'experiment') {
        setLensPage(false)
        setExperimentPage(true)
      } else if (target === 'lab') {
        if (!entered && checkpointRead.checkpoint !== null) {
          handleResumeJourney()
          return
        }
        if (!entered) {
          announceCoach(COACH_INTRODUCTION)
        }
        setLensPage(false)
        setExperimentPage(false)
        setEntered(true)
      } else {
        setLensPage(false)
        setExperimentPage(false)
        setEntered(false)
      }
    },
    [
      cancelAdvance,
      checkpointRead.checkpoint,
      announceCoach,
      endDemoToManual,
      entered,
      handleResumeJourney,
    ],
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
    announceCoach(
      'Got it. Connect the two open ends with one wire, then press Test to check your prediction.',
    )
    setL1Prediction(prediction)
    advanceDemoBeat('build')
  }

  const handleRealityPredicted = (prediction: Prediction) => {
    announceCoach(
      'Got it. Leave the switch open and watch what happens when the lab tests the circuit.',
    )
    setRealityPrediction(prediction)
    realityR4.current = false
    realityBulbLit.current = null
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

  const handleSpokenPrediction = (transcript: string): boolean => {
    const choice = spokenPredictionChoice(transcript)
    if (choice === null) {
      return false
    }
    const prediction = createPrediction(
      stage === 'reality-predict' ? L1.twist.id : L1.id,
      choice,
      transcript.trim().slice(0, 140),
    )
    if (stage === 'l1-predict') {
      handleL1Predicted(prediction)
      return true
    }
    if (stage === 'reality-predict') {
      handleRealityPredicted(prediction)
      return true
    }
    return false
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
  const renderCoachDock = () =>
    demo.active ? null : (
      <Suspense fallback={null}>
        <CoachConversation
          enabled={coachVoiceEnabled}
          onEnabledChange={setCoachVoiceEnabled}
          replyAvailable={complete === null || complete.coach !== undefined}
          learnerText={learnerReply}
          onLearnerTextChange={setLearnerReply}
          onPrediction={handleSpokenPrediction}
        />
      </Suspense>
    )

  return (
    <JourneyShell
      stage={stage}
      auto={auto && !demo.active}
      location={location}
      onNavigate={handleNavigate}
      demoBar={demoBar}
      demoActive={demo.active}
      notice={
        resumedCheckpoint && entered ? (
          <div className="glass-panel mb-4 flex items-start justify-between gap-3 border-flow/30 p-3 text-sm text-ink" role="status">
            <p>
              Saved predictions and completed measurements are restored. An unfinished circuit, if any,
              starts from its lesson setup.
            </p>
            <button
              type="button"
              onClick={() => setResumedCheckpoint(false)}
              aria-label="Dismiss saved progress notice"
              className="border-glass-border min-h-9 shrink-0 rounded-[8px] border px-3 text-xs"
            >
              Dismiss
            </button>
          </div>
        ) : undefined
      }
      wide
      tools={
        <Suspense fallback={<p className="text-ink-muted text-sm">Preparing presenter controls…</p>}>
          {developerTools}
        </Suspense>
      }
    >
      {stage === 'intro' && (
        <LabIntro
          onEnter={handleStartJourney}
          onExperiment={() => handleNavigate('experiment')}
          onExploreLens={handleExploreLens}
          onDemo={startDemo}
          resumeAvailable={checkpointRead.checkpoint !== null}
          onResume={handleResumeJourney}
          storageNotice={
            checkpointRead.status === 'invalid'
              ? 'Saved progress is expired or unreadable. Start a new guided run to continue.'
              : checkpointRead.status === 'unavailable'
                ? 'This browser could not access saved progress. Keep the tab open to retain your place.'
                : null
          }
        />
      )}
      {stage === 'l1-predict' && (
        <PredictionScreen
          challenge={L1}
          eyebrow="Predict · Light the bulb"
          coachDock={renderCoachDock()}
          onComplete={handleL1Predicted}
          demo={l1Demo}
          proofStage="l1-predict"
        />
      )}
      {stage === 'l1-build' && l1Prediction !== null && (
        <div className="flex flex-col gap-4">
          <Suspense fallback={CANVAS_FALLBACK}>
          <CircuitCanvas
            key="l1"
            proofStage="l1-build"
            seed={L1.seed}
            eyebrow="Build · Light the bulb"
            instructions="Connect the two open ends with one wire, then press Test to check your prediction."
            onSolved={handleL1Solved}
            onDirty={handleDirty}
            onEvidence={handleEvidence}
            layout="split"
            prediction={l1Prediction}
            challenge={L1}
            coachVoiceEnabled={coachVoiceEnabled}
            coachDock={renderCoachDock()}
            autoStruggleHint
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
          coachDock={renderCoachDock()}
          onComplete={handleRealityPredicted}
          demo={realityDemo}
          proofStage="reality-predict"
        />
      )}
      {stage === 'reality-build' && realityPrediction !== null && (
        <div className="flex flex-col gap-4">
          <Suspense fallback={CANVAS_FALLBACK}>
          <CircuitCanvas
            key="reality"
            proofStage="reality-build"
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
            coachVoiceEnabled={coachVoiceEnabled}
            coachDock={renderCoachDock()}
            expectSwitchOpen
            autoDemonstrate={auto && !demo.paused}
            autoAsk={demo.active && !demo.paused}
            autoInitialHint
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
              Solo mode  -  there is no coach for this challenge. Trust your reasoning.
            </p>
          </div>
          <PredictionScreen
            challenge={TRANSFER}
            eyebrow="Solo · The second bulb"
            continueLabel="Continue to wire it"
            onComplete={setTransferPrediction}
            demo={transferDemo}
            proofStage="transfer-predict"
          />
        </div>
      )}
      {stage === 'transfer-build' && transferPrediction !== null && (
        <div className="flex flex-col gap-4">
          <div className="glass-panel p-4" role="note">
            <p className="text-sm text-ink-muted">
              Solo mode  -  there is no coach for this challenge. Predict, build, and check
              against the simulator.
            </p>
          </div>
          <Suspense fallback={CANVAS_FALLBACK}>
          <CircuitCanvas
            key="transfer"
            proofStage="transfer-build"
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
        <Suspense fallback={<p className="text-ink-muted text-sm">Preparing your recap…</p>}>
          <JourneyFinale
            chapters={finaleChapters}
            onReturnHub={() => handleNavigate('hub')}
            onExploreLens={() => {
              jumpToLens()
            }}
          />
        </Suspense>
      )}
      {STAGE_CONTENT[stage] /* exhaustiveness: every stage renders above */}
    </JourneyShell>
  )
}
