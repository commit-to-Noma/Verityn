/** Typed client for the Verityn Flask API (M4 contracts, mirrored exactly). */

export interface ApiComponent {
  id: string
  type: 'battery' | 'resistor' | 'bulb' | 'switch' | 'wire'
  a: string
  b: string
  volts?: number
  ohms?: number
  closed?: boolean
}

export interface Netlist {
  components: ApiComponent[]
}

export type Claim =
  | { type: 'lit'; component: string; value: boolean }
  | { type: 'compare_brightness'; a: string; b: string; relation: 'brighter' | 'dimmer' | 'equal' }

export interface ComponentResult {
  voltage: number
  current: number
  power: number
}

export interface SimulateResult {
  ok: boolean
  node_voltages: Record<string, number>
  components: Record<string, ComponentResult>
  error_code: string | null
  error_message: string
  component_ids: string[]
}

export type VerdictStatus = 'CONSISTENT' | 'CONTRADICTED' | 'UNASSESSABLE'

export interface VerdictResult {
  status: VerdictStatus
  reason: string | null
  evidence: Record<string, number>
}

export interface EvaluateResult {
  result: SimulateResult
  verdict: VerdictResult
}

export type ApiErrorKind = 'network' | 'http' | 'payload'

/** Classified client-side failure. Never carries a stack to the UI. */
export class ApiError extends Error {
  kind: ApiErrorKind
  status: number | null
  code: string | null

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every((entry) => typeof entry === 'number')
  )
}

function isComponentResult(value: unknown): value is ComponentResult {
  return (
    isRecord(value) &&
    typeof value.voltage === 'number' &&
    typeof value.current === 'number' &&
    typeof value.power === 'number'
  )
}

function guardSimulateResult(body: unknown): SimulateResult {
  if (!isRecord(body) || typeof body.ok !== 'boolean') {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  if (
    !isNumberRecord(body.node_voltages) ||
    !isRecord(body.components) ||
    !Object.values(body.components).every(isComponentResult) ||
    (body.error_code !== null && typeof body.error_code !== 'string') ||
    typeof body.error_message !== 'string' ||
    !Array.isArray(body.component_ids) ||
    !body.component_ids.every((id) => typeof id === 'string')
  ) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  return {
    ok: body.ok,
    node_voltages: body.node_voltages,
    components: body.components as Record<string, ComponentResult>,
    error_code: body.error_code,
    error_message: body.error_message,
    component_ids: body.component_ids,
  }
}

function guardVerdict(body: unknown): VerdictResult {
  if (
    !isRecord(body) ||
    (body.status !== 'CONSISTENT' &&
      body.status !== 'CONTRADICTED' &&
      body.status !== 'UNASSESSABLE') ||
    (body.reason !== null && typeof body.reason !== 'string') ||
    !isNumberRecord(body.evidence)
  ) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  return { status: body.status, reason: body.reason, evidence: body.evidence }
}

function guardEvaluateResult(body: unknown): EvaluateResult {
  if (!isRecord(body)) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  return { result: guardSimulateResult(body.result), verdict: guardVerdict(body.verdict) }
}

export type BackendHealth = 'up' | 'down'

type HealthListener = (health: BackendHealth) => void

const healthListeners = new Set<HealthListener>()

/** Subscribe to backend reachability; returns an unsubscribe function. */
export function subscribeBackendHealth(listener: HealthListener): () => void {
  healthListeners.add(listener)
  return () => {
    healthListeners.delete(listener)
  }
}

function reportBackendHealth(health: BackendHealth): void {
  for (const listener of healthListeners) {
    listener(health)
  }
}

async function postJson(path: string, payload: unknown, signal?: AbortSignal): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (err) {
    if (signal?.aborted) {
      throw err
    }
    // Transport failure: the backend may be gone. Any HTTP response,
    // even an error status, proves reachability instead — except gateway
    // statuses, which mean a proxy answered but the backend did not.
    reportBackendHealth('down')
    throw new ApiError('network', 'Could not reach the backend. Is it running?')
  }
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    reportBackendHealth('down')
    throw new ApiError(
      'network',
      'Could not reach the backend. Is it running?',
      res.status,
      null,
    )
  }
  reportBackendHealth('up')
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    if (isRecord(body) && typeof body.error_code === 'string') {
      throw new ApiError(
        'http',
        typeof body.error_message === 'string' && body.error_message
          ? body.error_message
          : `Backend replied HTTP ${res.status}.`,
        res.status,
        body.error_code,
      )
    }
    if (res.status === 404) {
      throw new ApiError(
        'http',
        'Simulation route not found. Restart the backend from the project root, then try again.',
        res.status,
        'NOT_FOUND',
      )
    }
    throw new ApiError('http', `Backend replied HTTP ${res.status}.`, res.status, null)
  }
  if (body === null) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  return body
}

/** POST /api/simulate with a bare netlist. */
export async function simulate(netlist: Netlist, signal?: AbortSignal): Promise<SimulateResult> {
  return guardSimulateResult(await postJson('/api/simulate', netlist, signal))
}

/** POST /api/evaluate; the server solves before judging. */
export async function evaluateClaim(
  claim: Claim,
  netlist: Netlist,
  signal?: AbortSignal,
): Promise<EvaluateResult> {
  return guardEvaluateResult(await postJson('/api/evaluate', { claim, netlist }, signal))
}

export interface CoachPredictResult {
  session_id: string
  challenge_id: string
  choice: string
}

export interface CoachServerAction {
  type:
    | 'highlight_component'
    | 'highlight_terminal'
    | 'set_switch_state'
    | 'pulse_current_path'
    | 'show_measurement'
  componentId: string
  terminal?: 'a' | 'b'
  closed?: boolean
}

export type CoachAskResult =
  | {
      eligible: true
      rung: string
      text: string
      provider: string
      claim: Claim
      actions: CoachServerAction[]
    }
  | { eligible: false; reason_code: string; message: string }

/** Provider value to honest badge text. Fake output is never Meta. */
export function providerBadge(provider: string, rung?: string): string {
  if (provider === 'meta-spark') {
    return 'Meta Muse'
  }
  if (provider === 'deterministic') {
    if (rung === 'R2') {
      return 'Evidence pointer'
    }
    if (rung === 'R4') {
      return 'Confirmation check'
    }
    return 'Guide'
  }
  return provider === 'prototype-fake' ? 'Fallback coach' : 'Coach'
}

function guardClaim(body: unknown): Claim {
  if (
    isRecord(body) &&
    body.type === 'lit' &&
    typeof body.component === 'string' &&
    typeof body.value === 'boolean'
  ) {
    return { type: 'lit', component: body.component, value: body.value }
  }
  if (
    isRecord(body) &&
    body.type === 'compare_brightness' &&
    typeof body.a === 'string' &&
    typeof body.b === 'string' &&
    (body.relation === 'brighter' || body.relation === 'dimmer' || body.relation === 'equal')
  ) {
    return { type: 'compare_brightness', a: body.a, b: body.b, relation: body.relation }
  }
  throw new ApiError('payload', 'Unexpected response from the server.')
}

function guardCoachPredictResult(body: unknown): CoachPredictResult {
  if (
    !isRecord(body) ||
    typeof body.session_id !== 'string' ||
    typeof body.challenge_id !== 'string' ||
    typeof body.choice !== 'string'
  ) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  return { session_id: body.session_id, challenge_id: body.challenge_id, choice: body.choice }
}

const SERVER_ACTION_TYPES = new Set([
  'highlight_component',
  'highlight_terminal',
  'set_switch_state',
  'pulse_current_path',
  'show_measurement',
])

function guardServerAction(body: unknown): CoachServerAction {
  if (
    !isRecord(body) ||
    typeof body.type !== 'string' ||
    !SERVER_ACTION_TYPES.has(body.type) ||
    typeof body.componentId !== 'string' ||
    body.componentId === ''
  ) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  const action = { type: body.type, componentId: body.componentId } as CoachServerAction
  if (body.type === 'highlight_terminal') {
    if (body.terminal !== 'a' && body.terminal !== 'b') {
      throw new ApiError('payload', 'Unexpected response from the server.')
    }
    action.terminal = body.terminal
  } else if (body.terminal !== undefined) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  if (body.type === 'set_switch_state') {
    if (typeof body.closed !== 'boolean') {
      throw new ApiError('payload', 'Unexpected response from the server.')
    }
    action.closed = body.closed
  } else if (body.closed !== undefined) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  return action
}

function guardCoachAskResult(body: unknown): CoachAskResult {
  if (!isRecord(body) || typeof body.eligible !== 'boolean') {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  if (body.eligible) {
    if (
      typeof body.rung !== 'string' ||
      typeof body.text !== 'string' ||
      typeof body.provider !== 'string' ||
      !Array.isArray(body.actions)
    ) {
      throw new ApiError('payload', 'Unexpected response from the server.')
    }
    return {
      eligible: true,
      rung: body.rung,
      text: body.text,
      provider: body.provider,
      claim: guardClaim(body.claim),
      actions: body.actions.map(guardServerAction),
    }
  }
  if (typeof body.reason_code !== 'string' || typeof body.message !== 'string') {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  return { eligible: false, reason_code: body.reason_code, message: body.message }
}

/** POST /api/coach/predict; records a prediction server-side. */
export async function recordPrediction(
  challengeId: string,
  choice: string,
  why: string,
  sessionId?: string,
  signal?: AbortSignal,
): Promise<CoachPredictResult> {
  const payload: Record<string, string> = { challenge_id: challengeId, choice, why }
  if (sessionId !== undefined) {
    payload.session_id = sessionId
  }
  return guardCoachPredictResult(await postJson('/api/coach/predict', payload, signal))
}

/** POST /api/coach/ask; eligibility is derived server-side. */
export async function askCoach(
  sessionId: string,
  netlist: Netlist,
  signal?: AbortSignal,
  rung = 'R1',
): Promise<CoachAskResult> {
  return guardCoachAskResult(
    await postJson('/api/coach/ask', { session_id: sessionId, netlist, rung }, signal),
  )
}

/** Mirror of the server's image upload limits (pre-check only). */
export const VISION_MAX_IMAGE_BYTES = 4 * 1024 * 1024
export const VISION_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export interface VisionComponent {
  id: string
  type: 'battery' | 'bulb' | 'switch'
  /** Strict keys: null marks unknown or not-applicable, never missing. */
  closed: boolean | null
  polarity: { positive: 'a' | 'b'; negative: 'a' | 'b' } | null
  evidence: VisionComponentEvidence
}

export interface VisionComponentEvidence {
  region_id: string
  bounds: { x: number; y: number; width: number; height: number }
  rotation: number
}

export interface VisionEndpoint {
  node: string
  terminal: string
}

export interface VisionConnection {
  from: VisionEndpoint
  to: VisionEndpoint
  uncertain: boolean
  evidence: { region_id: string }
}

export interface VisionProposal {
  status: 'ready' | 'needs_review' | 'unsupported'
  components: VisionComponent[]
  connections: VisionConnection[]
}

export interface VisionProposeResult {
  proposal: VisionProposal
  assumptions: string[]
  provider: string
}

function isVisionEndpoint(value: unknown): value is VisionEndpoint {
  return (
    isRecord(value) &&
    typeof value.node === 'string' &&
    typeof value.terminal === 'string'
  )
}

function guardVisionProposal(body: unknown): VisionProposal {
  if (
    !isRecord(body) ||
    (body.status !== 'ready' && body.status !== 'needs_review' && body.status !== 'unsupported') ||
    !Array.isArray(body.components) ||
    !Array.isArray(body.connections)
  ) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  if (body.status === 'unsupported' && (body.components.length > 0 || body.connections.length > 0)) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  for (const component of body.components) {
    if (
      !isRecord(component) ||
      typeof component.id !== 'string' ||
      (component.type !== 'battery' && component.type !== 'bulb' && component.type !== 'switch') ||
      !isVisionComponentEvidence(component.evidence)
    ) {
      throw new ApiError('payload', 'Unexpected response from the server.')
    }
    // Strict keys are always present; null is the only unknown marker.
    if (component.type === 'switch') {
      if (typeof component.closed !== 'boolean' && component.closed !== null) {
        throw new ApiError('payload', 'Unexpected response from the server.')
      }
    } else if (component.closed !== null) {
      throw new ApiError('payload', 'Unexpected response from the server.')
    }
    if (component.type === 'battery') {
      if (
        component.polarity !== null &&
        (!isRecord(component.polarity) ||
          (component.polarity.positive !== 'a' && component.polarity.positive !== 'b') ||
          (component.polarity.negative !== 'a' && component.polarity.negative !== 'b') ||
          component.polarity.positive === component.polarity.negative)
      ) {
        throw new ApiError('payload', 'Unexpected response from the server.')
      }
    } else if (component.polarity !== null) {
      throw new ApiError('payload', 'Unexpected response from the server.')
    }
  }
  for (const connection of body.connections) {
    if (
      !isRecord(connection) ||
      !isVisionEndpoint(connection.from) ||
      !isVisionEndpoint(connection.to) ||
      typeof connection.uncertain !== 'boolean' ||
      !isRecord(connection.evidence) ||
      typeof connection.evidence.region_id !== 'string' ||
      connection.evidence.region_id.trim() === ''
    ) {
      throw new ApiError('payload', 'Unexpected response from the server.')
    }
  }
  return body as unknown as VisionProposal
}

function isVisionComponentEvidence(value: unknown): value is VisionComponentEvidence {
  if (!isRecord(value) || typeof value.region_id !== 'string' || !isRecord(value.bounds)) {
    return false
  }
  const bounds = value.bounds
  return (
    typeof bounds.x === 'number' && bounds.x >= 0 && bounds.x <= 1 &&
    typeof bounds.y === 'number' && bounds.y >= 0 && bounds.y <= 1 &&
    typeof bounds.width === 'number' && bounds.width > 0 && bounds.width <= 1 &&
    typeof bounds.height === 'number' && bounds.height > 0 && bounds.height <= 1 &&
    bounds.x + bounds.width <= 1 && bounds.y + bounds.height <= 1 &&
    typeof value.rotation === 'number' && value.rotation >= -180 && value.rotation <= 180
  )
}

function guardVisionProposeResult(body: unknown): VisionProposeResult {
  if (
    !isRecord(body) ||
    !Array.isArray(body.assumptions) ||
    !body.assumptions.every((entry) => typeof entry === 'string') ||
    typeof body.provider !== 'string'
  ) {
    throw new ApiError('payload', 'Unexpected response from the server.')
  }
  return {
    proposal: guardVisionProposal(body.proposal),
    assumptions: body.assumptions,
    provider: body.provider,
  }
}

/** POST /api/vision/propose; nothing proposed reaches the solver here. */
export async function proposeCircuit(
  image: string,
  signal?: AbortSignal,
): Promise<VisionProposeResult> {
  return guardVisionProposeResult(await postJson('/api/vision/propose', { image }, signal))
}
