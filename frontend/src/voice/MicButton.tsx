import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { createRecognizer, type ListenState } from './speech'

/** Optional dictation for a learner text field. Transcripts enter the
 *  ordinary input for inspection and editing before submission; the
 *  text path always works, with or without microphone support. */
export default function MicButton({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [state, setState] = useState<ListenState>('idle')
  const transcriptRef = useRef(onTranscript)
  useEffect(() => {
    transcriptRef.current = onTranscript
  })
  const recognizer = useMemo(
    () =>
      createRecognizer(globalThis as unknown as Record<string, unknown>, {
        onTranscript: (text) => transcriptRef.current(text),
        onState: setState,
      }),
    [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
  )

  useEffect(() => () => recognizer.stop(), [recognizer])

  if (state === 'unsupported') {
    return (
      <button
        type="button"
        disabled
        title="Voice input is not supported in this browser — type instead."
        aria-label="Voice input not supported"
        className="text-ink-muted absolute top-1/2 right-2 -translate-y-1/2 cursor-not-allowed rounded-[8px] p-2 opacity-40"
      >
        <Mic className="h-4 w-4" aria-hidden="true" />
      </button>
    )
  }
  if (state === 'denied') {
    return (
      <button
        type="button"
        disabled
        title="Microphone blocked — type instead, or allow access and reload."
        aria-label="Microphone blocked"
        className="text-ink-muted absolute top-1/2 right-2 -translate-y-1/2 cursor-not-allowed rounded-[8px] p-2 opacity-40"
      >
        <Mic className="h-4 w-4" aria-hidden="true" />
      </button>
    )
  }
  if (state === 'listening') {
    return (
      <>
        <span className="sr-only" role="status">
          Listening…
        </span>
        <button
          type="button"
          onClick={() => recognizer.stop()}
          aria-label="Stop dictation"
          title="Listening — select to stop"
          className="text-bad absolute top-1/2 right-2 -translate-y-1/2 rounded-[8px] p-2"
        >
          <Square className="h-4 w-4" aria-hidden="true" />
        </button>
      </>
    )
  }
  return (
    <button
      type="button"
      onClick={() => recognizer.start()}
      aria-label={state === 'no-speech' ? 'Heard nothing — try dictation again' : 'Dictate your reason'}
      title={
        state === 'no-speech'
          ? 'Heard nothing — try again, or type instead.'
          : state === 'unavailable'
            ? 'Dictation hit a glitch — try again, or type instead.'
            : 'Dictate your reason (optional)'
      }
      className="text-ink-muted absolute top-1/2 right-2 -translate-y-1/2 rounded-[8px] p-2 hover:text-ink"
    >
      <Mic className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}
