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
    throw new ApiError('network', 'Could not reach the backend. Is it running?')
  }
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
