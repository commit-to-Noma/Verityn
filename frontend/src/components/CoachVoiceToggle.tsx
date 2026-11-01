import { useState } from 'react'
import { Settings, Volume2, VolumeX } from 'lucide-react'
import { repeatCoach, stopCoach } from '../voice/coachVoice'

/** Voice settings live behind a gear icon; spoken playback stays default-off. */
export default function CoachVoiceToggle({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex self-start">
      <button
        type="button"
        aria-label="Voice settings"
        aria-expanded={open}
        title="Voice settings"
        onClick={() => setOpen(!open)}
        className="border-glass-border text-ink-muted hover:text-ink inline-flex h-11 w-11 items-center justify-center rounded-full border transition"
      >
        <Settings className="h-5 w-5" aria-hidden="true" />
        {enabled && (
          <span
            aria-hidden="true"
            className="bg-flow absolute right-2.5 top-2.5 h-2 w-2 rounded-full"
          />
        )}
      </button>
      {open && (
        <span className="border-glass-border absolute right-0 top-full z-[60] mt-2 flex w-64 flex-col gap-2 rounded-xl border bg-[rgb(10_14_28/0.98)] p-3 shadow-xl">
          <button
            type="button"
            aria-pressed={enabled}
            aria-label={enabled ? 'Mute browser voice' : 'Turn on browser voice'}
            title="Spoken playback uses your browser voice, not Meta"
            onClick={() => {
              if (enabled) {
                stopCoach()
              } else {
                repeatCoach()
              }
              onChange(!enabled)
            }}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-[10px] border px-3 text-sm font-medium transition ${
              enabled
                ? 'border-flow/50 bg-flow/10 text-flow'
                : 'border-glass-border text-ink-muted hover:text-ink'
            }`}
          >
            {enabled ? (
              <Volume2 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4" aria-hidden="true" />
            )}
            Browser voice {enabled ? 'on' : 'muted'}
          </button>
          <span className="text-ink-muted text-xs">Spoken playback uses your browser voice, not Meta.</span>
        </span>
      )}
    </span>
  )
}
