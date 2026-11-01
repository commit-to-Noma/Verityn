import { useEffect, useState } from 'react'
import { CircleCheckBig, CircleX, LoaderCircle } from 'lucide-react'
import { subscribeBackendHealth } from '../api/client'

type Status = 'checking' | 'waking' | 'connected' | 'error'

const HEALTH_WAIT_MS = 30_000
const REQUEST_TIMEOUT_MS = 3_000
const RETRY_DELAY_MS = 1_000

/** Calls GET /api/health, retries during startup, then offers an explicit retry. */
export default function HealthStatus({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status>('checking')
  const [detail, setDetail] = useState('')
  const [progress, setProgress] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(
    () =>
      subscribeBackendHealth((health) => {
        if (health === 'down') {
          setDetail('A request failed; the backend may be unreachable.')
          setStatus('error')
        } else {
          setDetail('')
          setProgress(100)
          setStatus('connected')
        }
      }),
    [],
  )

  useEffect(() => {
    const startedAt = Date.now()
    let stopped = false
    let completed = false
    let lastError = 'no response'
    let controller: AbortController | null = null
    let retryTimer = 0
    let wakeTimer = 0
    let deadlineTimer = 0
    let progressTimer = 0

    const clearTimers = () => {
      window.clearTimeout(retryTimer)
      window.clearTimeout(wakeTimer)
      window.clearTimeout(deadlineTimer)
      window.clearInterval(progressTimer)
    }

    const fail = () => {
      if (stopped || completed) return
      completed = true
      controller?.abort()
      clearTimers()
      setProgress(100)
      setDetail(`The simulator did not respond within 30 seconds. Last check: ${lastError}.`)
      setStatus('error')
    }

    const succeed = () => {
      if (stopped || completed) return
      completed = true
      clearTimers()
      setDetail('')
      setProgress(100)
      setStatus('connected')
    }

    const check = async () => {
      if (stopped || completed) return
      controller = new AbortController()
      const requestController = controller
      const timeout = window.setTimeout(
        () => requestController.abort(),
        REQUEST_TIMEOUT_MS,
      )
      try {
        const response = await fetch('/api/health', { signal: requestController.signal })
        if (!response.ok) {
          throw new Error(`backend replied HTTP ${response.status}`)
        }
        const body: unknown = await response.json()
        if (typeof body !== 'object' || body === null ||
            (body as { status?: unknown }).status !== 'ok') {
          throw new Error('unexpected health response')
        }
        succeed()
      } catch (error) {
        if (stopped || completed) return
        lastError = error instanceof Error && error.name !== 'AbortError'
          ? error.message
          : 'health check timed out'
        setStatus('waking')
        retryTimer = window.setTimeout(() => void check(), RETRY_DELAY_MS)
      } finally {
        window.clearTimeout(timeout)
      }
    }

    wakeTimer = window.setTimeout(() => setStatus('waking'), 1_000)
    deadlineTimer = window.setTimeout(fail, HEALTH_WAIT_MS)
    progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt
      setProgress(Math.min(99, Math.floor((elapsed / HEALTH_WAIT_MS) * 100)))
      if (elapsed >= HEALTH_WAIT_MS) fail()
    }, 250)
    void check()

    return () => {
      stopped = true
      controller?.abort()
      clearTimers()
    }
  }, [attempt])

  const retry = () => {
    setStatus('checking')
    setDetail('')
    setProgress(0)
    setAttempt((current) => current + 1)
  }

  const progressBar = (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-glass-border"
      role="progressbar"
      aria-label="Simulator startup"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
    >
      <div className="h-full rounded-full bg-flow transition-[width]" style={{ width: `${progress}%` }} />
    </div>
  )

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        {(status === 'checking' || status === 'waking') && (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin text-unknown" aria-hidden="true" />
            <span className="text-xs text-ink-muted">
              {status === 'waking'
                ? 'Waking the simulator. First load can take up to 30 seconds.'
                : 'Checking backend…'}
            </span>
            {status === 'waking' && <span className="w-full">{progressBar}</span>}
          </>
        )}
        {status === 'connected' && (
          <>
            <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
            <span className="text-xs text-ink-muted">Simulator ready</span>
          </>
        )}
        {status === 'error' && (
          <>
            <span className="h-2 w-2 rounded-full bg-bad" aria-hidden="true" />
            <span className="text-xs text-ink-muted">Backend unreachable</span>
            <button
              type="button"
              onClick={retry}
              title={detail || 'Retry backend health check'}
              className="min-h-[32px] rounded-[8px] border border-glass-border px-2 text-xs font-medium"
            >
              Retry
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="glass-panel flex items-center gap-3 p-4" role="status" aria-live="polite">
      {status === 'checking' && (
        <>
          <LoaderCircle className="h-6 w-6 animate-spin text-unknown" aria-hidden="true" />
          <p className="text-base">Checking backend…</p>
        </>
      )}
      {status === 'waking' && (
        <>
          <LoaderCircle className="h-6 w-6 animate-spin text-unknown" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm">Waking the simulator. First load can take up to 30 seconds.</p>
            {progressBar}
          </div>
        </>
      )}
      {status === 'connected' && (
        <>
          <CircleCheckBig className="h-6 w-6 text-ok" aria-hidden="true" />
          <div>
            <p className="text-base font-medium">Simulator ready</p>
          </div>
        </>
      )}
      {status === 'error' && (
        <>
          <CircleX className="h-6 w-6 shrink-0 text-bad" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium">Backend unreachable</p>
            <p className="break-words text-sm text-ink-muted">{detail}</p>
          </div>
          <button
            type="button"
            onClick={retry}
            className="bg-flow text-on-accent min-h-[44px] shrink-0 rounded-[10px] px-4 text-sm font-medium"
          >
            Retry
          </button>
        </>
      )}
    </div>
  )
}
