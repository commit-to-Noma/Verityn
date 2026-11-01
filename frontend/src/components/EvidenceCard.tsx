import { useEffect, useRef, useState } from 'react'
import type { ChapterRecap } from '../journey/story'
import { subscribeTraceEvents, traceCounts, traceEvents } from '../trace/session'
import { buildEvidenceCard, cardLines, renderEvidencePng } from '../evidence/card'
import { publicUrl } from '../config'

const PNG_FILENAME = 'verityn-evidence.png'

/** Shareable evidence card: the rendered PNG is the preview and the download. */
export default function EvidenceCard({
  chapters,
  reflection,
}: {
  chapters: ChapterRecap[]
  reflection?: string | null
}) {
  const [tick, setTick] = useState(0)
  const [status, setStatus] = useState('')
  const [includeWhy, setIncludeWhy] = useState(false)
  const [rendered, setRendered] = useState<{ key: string; url: string | null } | null>(null)
  const doneKey = useRef<string | null>(null)
  useEffect(() => subscribeTraceEvents(() => setTick((count) => count + 1)), [])
  const events = traceEvents()
  const model = buildEvidenceCard(
    chapters,
    { ...traceCounts(events), total: events.length, tools: events.map((event) => event.tool) },
    publicUrl(),
    includeWhy,
    reflection,
  )
  const lines = model === null ? [] : cardLines(model)
  const key = model === null ? null : `${tick}:${lines.join('\n')}`
  useEffect(() => {
    if (model === null || key === null || doneKey.current === key) {
      return
    }
    let live = true
    const pending = key
    renderEvidencePng(model).then(
      (dataUrl) => {
        if (live) {
          doneKey.current = pending
          setRendered({ key: pending, url: dataUrl })
        }
      },
      () => {
        if (live) {
          doneKey.current = pending
          setRendered({ key: pending, url: null })
        }
      },
    )
    return () => {
      live = false
    }
  }, [key, model])
  if (model === null) {
    return null
  }
  const preview = rendered !== null && rendered.key === key ? rendered.url : undefined
  const render = () => preview ?? renderEvidencePng(model)
  const download = async () => {
    try {
      const dataUrl = await render()
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = PNG_FILENAME
      document.body.appendChild(link)
      link.click()
      link.remove()
      setStatus('Evidence card downloaded.')
    } catch {
      setStatus('Could not render the card in this browser.')
    }
  }
  const share = async () => {
    try {
      const dataUrl = await render()
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], PNG_FILENAME, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] }) === true) {
        await navigator.share({ files: [file], title: 'Verityn evidence' })
        setStatus('Evidence card shared.')
      } else {
        setStatus('Sharing is unavailable here; download instead.')
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }
      setStatus('Could not share the card in this browser.')
    }
  }
  return (
    <section aria-label="Evidence card" className="glass-panel flex flex-col gap-3 p-4">
      <h3 className="font-semibold">Evidence card</h3>
      {preview !== null && preview !== undefined ? (
        <img
          src={preview}
          width={1200}
          height={630}
          alt={`Evidence card: ${lines.join('. ')}`}
          className="h-auto w-full rounded-[10px] border border-glass-border"
        />
      ) : preview === null ? (
        <ol className="flex flex-col gap-1.5">
          {lines.map((line, index) => (
            <li
              key={`${index}-${line.slice(0, 24)}`}
              className={index === 0 ? 'text-sm font-semibold' : 'text-ink-muted text-sm'}
            >
              {line}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-ink-muted text-sm" aria-live="polite">
          Rendering the card…
        </p>
      )}
      {model.metaTools.length > 0 && (
        <p className="text-ink-muted text-xs">
          Meta chips come from real provider calls anywhere in this app session. A Spark chip can come from
          Reality Lens; “Coach not asked” means only that the separate help ladder was not used.
        </p>
      )}
      <p className="text-ink-muted text-xs">Computed by a solver. Not an AI score.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={includeWhy} onChange={(event) => setIncludeWhy(event.target.checked)} />
        Include my written reason
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void download()}
          className="bg-flow text-on-accent min-h-[44px] rounded-[10px] px-4 text-sm font-medium"
        >
          Download card
        </button>
        {'share' in navigator && (
          <button
            type="button"
            onClick={() => void share()}
            className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
          >
            Share card
          </button>
        )}
      </div>
      {status !== '' && (
        <p className="text-ink-muted text-sm" role="status">
          {status}
        </p>
      )}
    </section>
  )
}
