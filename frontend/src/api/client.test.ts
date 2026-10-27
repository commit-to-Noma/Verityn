import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, askCoach, evaluateClaim, providerBadge, recordPrediction, simulate } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => handler(url, init)),
  )
}

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response
}

function errResponse(status: number, body: unknown): Response {
  return { ok: false, status, json: async () => body } as Response
}

const NETLIST = {
  components: [{ id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' } as const],
}

const SOLVED = {
  ok: true,
  node_voltages: { p: 6.0, '0': 0.0 },
  components: { L1: { voltage: 6.0, current: 0.6, power: 3.6 } },
  error_code: null,
  error_message: '',
  component_ids: [],
}

describe('simulate', () => {
  it('returns a valid success envelope unchanged', async () => {
    stubFetch(() => okResponse(SOLVED))
    await expect(simulate({ components: [] })).resolves.toEqual(SOLVED)
  })

  it('passes judged failures through without rewriting them', async () => {
    const judged = {
      ok: false,
      node_voltages: {},
      components: {},
      error_code: 'SHORTED_BATTERY',
      error_message: 'Battery B1 is shorted by W1.',
      component_ids: ['B1', 'W1'],
    }
    stubFetch(() => okResponse(judged))
    await expect(simulate({ components: [] })).resolves.toEqual(judged)
  })

  it.each([
    ['missing ok', { node_voltages: {}, components: {} }],
    ['ok mistyped', { ...SOLVED, ok: 'yes' }],
    ['components mistyped', { ...SOLVED, components: { L1: { voltage: 1 } } }],
    ['error_code mistyped', { ...SOLVED, error_code: 7 }],
    ['component_ids mistyped', { ...SOLVED, component_ids: 'L1' }],
    ['not an object', []],
  ])('rejects malformed payloads: %s', async (_label, body) => {
    stubFetch(() => okResponse(body))
    const failure = await simulate({ components: [] }).catch((err: unknown) => err)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).kind).toBe('payload')
  })

  it('posts the bare netlist as JSON', async () => {
    const mock = vi.fn(async () => okResponse(SOLVED))
    vi.stubGlobal('fetch', mock)
    await simulate(NETLIST)
    expect(mock).toHaveBeenCalledOnce()
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/simulate')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual(NETLIST)
  })
})

describe('evaluateClaim', () => {
  const claim = { type: 'lit', component: 'L1', value: true } as const
  const judged = {
    result: SOLVED,
    verdict: { status: 'CONSISTENT', reason: null, evidence: { 'L1.power_W': 3.6 } },
  }

  it('returns the nested result and verdict', async () => {
    stubFetch(() => okResponse(judged))
    await expect(evaluateClaim(claim, { components: [] })).resolves.toEqual(judged)
  })

  it.each([
    ['bad status', { ...judged, verdict: { ...judged.verdict, status: 'RIGHT' } }],
    ['evidence mistyped', { ...judged, verdict: { ...judged.verdict, evidence: [3.6] } }],
    ['result mistyped', { ...judged, result: { ok: 'yes' } }],
    ['missing verdict', { result: SOLVED }],
  ])('rejects malformed payloads: %s', async (_label, body) => {
    stubFetch(() => okResponse(body))
    const failure = await evaluateClaim(claim, { components: [] }).catch((err: unknown) => err)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).kind).toBe('payload')
  })

  it('posts claim and netlist together', async () => {
    const mock = vi.fn(async () => okResponse(judged))
    vi.stubGlobal('fetch', mock)
    await evaluateClaim(claim, NETLIST)
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/evaluate')
    expect(JSON.parse(init.body as string)).toEqual({ claim, netlist: NETLIST })
  })
})

describe('transport failures', () => {
  it('maps HTTP error envelopes to http errors with server detail', async () => {
    stubFetch(() =>
      errResponse(400, { error_code: 'MALFORMED_REQUEST', error_message: 'Nope.' }),
    )
    const failure = (await simulate({ components: [] }).catch((err: unknown) => err)) as ApiError
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.kind).toBe('http')
    expect(failure.status).toBe(400)
    expect(failure.code).toBe('MALFORMED_REQUEST')
    expect(failure.message).toBe('Nope.')
  })

  it('falls back to the status when the error body is unusable', async () => {
    stubFetch(() => ({ ok: false, status: 500, json: async () => null }) as Response)
    const failure = (await simulate({ components: [] }).catch((err: unknown) => err)) as ApiError
    expect(failure.kind).toBe('http')
    expect(failure.status).toBe(500)
    expect(failure.code).toBeNull()
  })

  it('maps rejected fetch to network errors', async () => {
    stubFetch(() => {
      throw new TypeError('fetch failed')
    })
    const failure = (await simulate({ components: [] }).catch((err: unknown) => err)) as ApiError
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.kind).toBe('network')
  })

  it('maps unparseable success bodies to payload errors', async () => {
    stubFetch(
      () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('bad json')
          },
        }) as unknown as Response,
    )
    const failure = (await simulate({ components: [] }).catch((err: unknown) => err)) as ApiError
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure.kind).toBe('payload')
  })

  it('lets aborts propagate unwrapped so callers stay silent', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError')
    stubFetch(() => {
      throw abortErr
    })
    const controller = new AbortController()
    controller.abort()
    await expect(simulate({ components: [] }, controller.signal)).rejects.toBe(abortErr)
  })
})

describe('recordPrediction', () => {
  const recorded = { session_id: 's1', challenge_id: 'L1T1', choice: 'yes' }

  it('returns the session record unchanged', async () => {
    stubFetch(() => okResponse(recorded))
    await expect(recordPrediction('L1T1', 'yes', 'Why not.')).resolves.toEqual(recorded)
  })

  it('posts prediction fields and an optional session id', async () => {
    const mock = vi.fn(async () => okResponse(recorded))
    vi.stubGlobal('fetch', mock)
    await recordPrediction('L1T1', 'no', 'Hmm.', 's9')
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/coach/predict')
    expect(JSON.parse(init.body as string)).toEqual({
      challenge_id: 'L1T1',
      choice: 'no',
      why: 'Hmm.',
      session_id: 's9',
    })
  })

  it.each([
    ['missing session', { challenge_id: 'L1T1', choice: 'yes' }],
    ['session mistyped', { ...recorded, session_id: 7 }],
    ['not an object', []],
  ])('rejects malformed payloads: %s', async (_label, body) => {
    stubFetch(() => okResponse(body))
    const failure = await recordPrediction('L1T1', 'yes', '').catch((err: unknown) => err)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).kind).toBe('payload')
  })

  it('maps HTTP failures to http errors', async () => {
    stubFetch(() => errResponse(400, { error_code: 'MALFORMED_REQUEST', error_message: 'Bad.' }))
    const failure = (await recordPrediction('L1T1', 'yes', '').catch(
      (err: unknown) => err,
    )) as ApiError
    expect(failure.kind).toBe('http')
    expect(failure.code).toBe('MALFORMED_REQUEST')
  })
})

describe('askCoach', () => {
  const claim = { type: 'lit', component: 'L1', value: true } as const
  const granted = {
    eligible: true,
    rung: 'R1',
    text: 'What has to be true?',
    provider: 'prototype-fake',
    claim,
  }
  const refused = { eligible: false, reason_code: 'NOT_CONTRADICTED', message: 'Consistent.' }

  it('returns granted and refused answers unchanged', async () => {
    stubFetch(() => okResponse(granted))
    await expect(askCoach('s1', { components: [] })).resolves.toEqual(granted)
    stubFetch(() => okResponse(refused))
    await expect(askCoach('s1', { components: [] })).resolves.toEqual(refused)
  })

  it('posts session id and netlist together', async () => {
    const mock = vi.fn(async () => okResponse(refused))
    vi.stubGlobal('fetch', mock)
    await askCoach('s1', NETLIST)
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/coach/ask')
    expect(JSON.parse(init.body as string)).toEqual({ session_id: 's1', netlist: NETLIST })
  })

  it.each([
    ['missing eligible', { rung: 'R1' }],
    ['eligible mistyped', { ...granted, eligible: 'yes' }],
    ['text mistyped', { ...granted, text: 7 }],
    ['claim mistyped', { ...granted, claim: { type: 'lit' } }],
    ['reason mistyped', { ...refused, reason_code: 7 }],
    ['not an object', []],
  ])('rejects malformed payloads: %s', async (_label, body) => {
    stubFetch(() => okResponse(body))
    const failure = await askCoach('s1', { components: [] }).catch((err: unknown) => err)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).kind).toBe('payload')
  })

  it('maps provider outages to http errors with the server code', async () => {
    stubFetch(() => errResponse(500, { error_code: 'INTERNAL_ERROR', error_message: 'Oops.' }))
    const failure = (await askCoach('s1', { components: [] }).catch(
      (err: unknown) => err,
    )) as ApiError
    expect(failure.kind).toBe('http')
    expect(failure.status).toBe(500)
    expect(failure.code).toBe('INTERNAL_ERROR')
  })
})

describe('providerBadge', () => {
  it('labels the prototype honestly and claims nothing else', () => {
    expect(providerBadge('prototype-fake')).toBe('Prototype coach')
    expect(providerBadge('meta-spark')).toBe('Meta Spark')
    expect(providerBadge('anything-else')).toBe('Coach')
  })
})
