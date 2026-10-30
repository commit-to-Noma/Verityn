import type { SimulateResult, VerdictStatus } from '../api/client'
import type { Prediction } from '../lessons/lesson'
import type { CoachTraceOutcome, DemoTraceEvent, TraceInput } from '../lessons/trace'

export const JOURNEY_PROGRESS_KEY = 'verityn.guided-lab-progress.v1'
export const JOURNEY_PROGRESS_VERSION = 1
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export interface JourneyCheckpoint {
  version: typeof JOURNEY_PROGRESS_VERSION
  savedAt: number
  l1Prediction: Prediction | null
  realityStarted: boolean
  realityPrediction: Prediction | null
  realitySession: string | null
  transferStarted: boolean
  transferPrediction: Prediction | null
  transferDone: boolean
  snapshots: Record<string, TraceInput>
}

export type CheckpointStatus = 'available' | 'empty' | 'invalid' | 'unavailable'

export interface CheckpointRead {
  status: CheckpointStatus
  checkpoint: JourneyCheckpoint | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPrediction(value: unknown): value is Prediction {
  return (
    isRecord(value) &&
    typeof value.lessonId === 'string' &&
    (value.choice === 'yes' || value.choice === 'no' || value.choice === 'not_sure') &&
    typeof value.why === 'string'
  )
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'number')
}

function isSimulateResult(value: unknown): value is SimulateResult {
  return (
    isRecord(value) &&
    typeof value.ok === 'boolean' &&
    isRecord(value.components) &&
    Object.values(value.components).every(
      (item) =>
        isRecord(item) &&
        typeof item.voltage === 'number' &&
        typeof item.current === 'number' &&
        typeof item.power === 'number',
    ) &&
    isNumberRecord(value.node_voltages) &&
    (value.error_code === null || typeof value.error_code === 'string') &&
    typeof value.error_message === 'string' &&
    Array.isArray(value.component_ids) &&
    value.component_ids.every((item) => typeof item === 'string') &&
    isRecord(value.conditions) &&
    isRecord(value.ratings)
  )
}

function isNetlist(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.components) &&
    value.components.every(
      (component) =>
        isRecord(component) &&
        typeof component.id === 'string' &&
        typeof component.type === 'string' &&
        typeof component.a === 'string' &&
        typeof component.b === 'string',
    )
  )
}

function isCoachOutcome(value: unknown): value is CoachTraceOutcome {
  if (!isRecord(value)) {
    return false
  }
  if (value.phase === 'unavailable') {
    return typeof value.message === 'string'
  }
  return value.phase === 'done' && typeof value.text === 'string' && typeof value.provider === 'string'
}

function isDemoEvent(value: unknown): value is DemoTraceEvent {
  return (
    isRecord(value) &&
    (value.phase === 'proposed' ||
      value.phase === 'applied' ||
      value.phase === 'observed' ||
      value.phase === 'undone') &&
    typeof value.label === 'string'
  )
}

function isVerdict(value: unknown): value is { status: VerdictStatus; evidence: Record<string, number> } {
  return (
    isRecord(value) &&
    (value.status === 'CONSISTENT' ||
      value.status === 'CONTRADICTED' ||
      value.status === 'UNASSESSABLE') &&
    isNumberRecord(value.evidence)
  )
}

function isTraceInput(value: unknown): value is TraceInput {
  return (
    isRecord(value) &&
    (value.prediction === null || isPrediction(value.prediction)) &&
    typeof value.question === 'string' &&
    (value.netlist === null || isNetlist(value.netlist)) &&
    (value.result === null || isSimulateResult(value.result)) &&
    (value.verdict === null || isVerdict(value.verdict)) &&
    (value.expectedLit === null || typeof value.expectedLit === 'boolean') &&
    (value.coach === null || isCoachOutcome(value.coach)) &&
    typeof value.coachAvailable === 'boolean' &&
    (value.demonstrations === undefined ||
      (Array.isArray(value.demonstrations) && value.demonstrations.every(isDemoEvent)))
  )
}

function isCheckpoint(value: unknown, now: number): value is JourneyCheckpoint {
  if (
    !isRecord(value) ||
    value.version !== JOURNEY_PROGRESS_VERSION ||
    typeof value.savedAt !== 'number' ||
    !Number.isFinite(value.savedAt) ||
    value.savedAt > now ||
    now - value.savedAt > MAX_AGE_MS ||
    (value.l1Prediction !== null && !isPrediction(value.l1Prediction)) ||
    typeof value.realityStarted !== 'boolean' ||
    (value.realityPrediction !== null && !isPrediction(value.realityPrediction)) ||
    (value.realitySession !== null && typeof value.realitySession !== 'string') ||
    typeof value.transferStarted !== 'boolean' ||
    (value.transferPrediction !== null && !isPrediction(value.transferPrediction)) ||
    typeof value.transferDone !== 'boolean' ||
    !isRecord(value.snapshots) ||
    !Object.values(value.snapshots).every(isTraceInput)
  ) {
    return false
  }
  return true
}

function decodeCheckpoint(value: unknown, now: number): JourneyCheckpoint | null {
  return isCheckpoint(value, now) ? value : null
}

export function readJourneyCheckpoint(storage: Storage, now = Date.now()): CheckpointRead {
  let stored: string | null
  try {
    stored = storage.getItem(JOURNEY_PROGRESS_KEY)
  } catch {
    return { status: 'unavailable', checkpoint: null }
  }
  if (stored === null) {
    return { status: 'empty', checkpoint: null }
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(stored) as unknown
  } catch {
    return { status: 'invalid', checkpoint: null }
  }
  const checkpoint = decodeCheckpoint(decoded, now)
  return checkpoint === null
    ? { status: 'invalid', checkpoint: null }
    : { status: 'available', checkpoint }
}

export function saveJourneyCheckpoint(storage: Storage, checkpoint: JourneyCheckpoint): boolean {
  try {
    storage.setItem(JOURNEY_PROGRESS_KEY, JSON.stringify(checkpoint))
    return true
  } catch {
    return false
  }
}

export function clearJourneyCheckpoint(storage: Storage): boolean {
  try {
    storage.removeItem(JOURNEY_PROGRESS_KEY)
    return true
  } catch {
    return false
  }
}
