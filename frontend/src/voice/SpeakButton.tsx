import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, Square, Volume2 } from 'lucide-react'
import { createSpeaker, type SpeakState } from './speech'

/** Reads real coach text aloud with browser speech synthesis. Captions
 *  are the visible message itself; playback stops on unmount. */
export default function SpeakButton({ text }: { text: string }) {
  const [state, setState] = useState<SpeakState>('idle')
  const speaker = useMemo(
    () => createSpeaker(globalThis as unknown as Record<string, unknown>, setState),
    [],
    // One speaker per button lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  )

  useEffect(() => () => speaker.stop(), [speaker])
  useEffect(() => {
    speaker.stop()
  }, [text, speaker])

  if (state === 'unsupported') {
    return (
      <span className="text-ink-muted text-xs" title="Spoken playback is not supported in this browser.">
        Voice playback unavailable
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1" aria-live="polite">
      {state === 'idle' && (
        <button
          type="button"
          onClick={() => speaker.speak(text)}
          aria-label="Listen to this message"
          title="Listen  -  browser speech synthesis"
          className="border-glass-border inline-flex min-h-[44px] items-center gap-1 rounded-[10px] border px-3 text-xs font-medium"
        >
          <Volume2 className="h-4 w-4" aria-hidden="true" />
          Listen
        </button>
      )}
      {state === 'speaking' && (
        <>
          <span className="text-flow inline-flex items-center gap-1 text-xs" role="status">
            <span className="flow-status-dot" aria-hidden="true" />
            Speaking…
          </span>
          <button
            type="button"
            onClick={() => speaker.pause()}
            aria-label="Pause playback"
            className="border-glass-border inline-flex min-h-[44px] items-center gap-1 rounded-[10px] border px-3 text-xs font-medium"
          >
            <Pause className="h-4 w-4" aria-hidden="true" />
            Pause
          </button>
          <button
            type="button"
            onClick={() => speaker.stop()}
            aria-label="Stop playback"
            className="border-glass-border inline-flex min-h-[44px] items-center gap-1 rounded-[10px] border px-3 text-xs font-medium"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            Stop
          </button>
        </>
      )}
      {state === 'paused' && (
        <>
          <span className="text-ink-muted text-xs" role="status">
            Paused
          </span>
          <button
            type="button"
            onClick={() => speaker.resume()}
            aria-label="Resume playback"
            className="border-glass-border inline-flex min-h-[44px] items-center gap-1 rounded-[10px] border px-3 text-xs font-medium"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Resume
          </button>
          <button
            type="button"
            onClick={() => speaker.stop()}
            aria-label="Stop playback"
            className="border-glass-border inline-flex min-h-[44px] items-center gap-1 rounded-[10px] border px-3 text-xs font-medium"
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            Stop
          </button>
        </>
      )}
    </span>
  )
}
