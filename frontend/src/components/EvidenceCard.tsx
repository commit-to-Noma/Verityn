import { useEffect, useState } from 'react'
import type { ChapterRecap } from '../journey/story'
import { subscribeTraceEvents, traceCounts, traceEvents } from '../trace/session'
import { buildEvidenceCard, cardLines, renderEvidencePng } from '../evidence/card'

const PNG_FILENAME = 'verityn-evidence.png'

/** Shareable evidence card: session facts rendered to a downloadable PNG. */
export default function EvidenceCard({ chapters }: { chapters: ChapterRecap[] }) {
  const [, setTick] = useState(0)
  const [status, setStatus] = useState('')
  useEffect(() => subscribeTraceEvents(() => setTick((tick) => tick + 1)), [])
  const events = traceEvents()
  const model = buildEvidenceCard(
    chapters,
    { ...traceCounts(events), total: events.length },
    window.location.origin,
  )
  if (model === null) {
    return null
  }
  const lines = cardLines(model)
  const download = async () => {
    try {
      const dataUrl = await renderEvidencePng(model)
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
      const dataUrl = await renderEvidencePng(model)
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
      <img
        src="/brand/verityn-logo.png"
        alt=""
        aria-hidden="true"
        className="h-10 w-10 rounded-[10px]"
      />
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
