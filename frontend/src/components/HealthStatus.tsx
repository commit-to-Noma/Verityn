import { useEffect, useState } from 'react'
import { CircleCheckBig, CircleX, LoaderCircle } from 'lucide-react'

type Status = 'loading' | 'connected' | 'error'

/** Calls GET /api/health and reports loading, connected, or error. */
export default function HealthStatus() {
  const [status, setStatus] = useState<Status>('loading')
  const [detail, setDetail] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal
    void (async () => {
      try {
        const res = await fetch('/api/health', { signal })
        if (!res.ok) {
          throw new Error(`backend replied HTTP ${res.status}`)
        }
        const body: unknown = await res.json()
        if (typeof body !== 'object' || body === null || (body as { status?: unknown }).status !== 'ok') {
          throw new Error('unexpected response body')
        }
        setDetail('')
        setStatus('connected')
      } catch (err) {
        if (signal.aborted) {
          return
        }
        setDetail(err instanceof Error ? err.message : 'request failed')
        setStatus('error')
      }
    })()
    return () => controller.abort()
  }, [attempt])

  return (
    <div className="glass-panel flex items-center gap-3 p-4" role="status" aria-live="polite">
      {status === 'loading' && (
        <>
          <LoaderCircle className="h-6 w-6 animate-spin text-unknown" aria-hidden="true" />
          <p className="text-base">Checking backend…</p>
        </>
      )}
      {status === 'connected' && (
        <>
          <CircleCheckBig className="h-6 w-6 text-ok" aria-hidden="true" />
          <div>
            <p className="text-base font-medium">Backend connected</p>
            <p className="font-mono text-sm text-ink-muted">{detail}</p>
          </div>
        </>
      )}
      {status === 'error' && (
        <>
          <CircleX className="h-6 w-6 shrink-0 text-bad" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium">Backend unreachable</p>
            <p className="truncate font-mono text-sm text-ink-muted">{detail}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setStatus('loading')
              setDetail('')
              setAttempt((n) => n + 1)
            }}
            className="bg-flow text-on-accent min-h-[44px] shrink-0 rounded-[10px] px-4 text-sm font-medium"
          >
            Retry
          </button>
        </>
      )}
    </div>
  )
}
