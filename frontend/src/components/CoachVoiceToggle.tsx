import { Volume2, VolumeX } from 'lucide-react'
import { repeatCoach, stopCoach } from '../voice/coachVoice'

/** Clear, direct control for optional browser voice playback. */
export default function CoachVoiceToggle({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
    <span className="inline-flex self-start">
      <button
        type="button"
        aria-label={enabled ? 'Mute browser voice' : 'Turn on browser voice'}
        aria-pressed={enabled}
        title="Spoken playback uses your browser voice, not Meta"
        onClick={() => {
          if (enabled) {
            stopCoach()
          } else {
            repeatCoach()
          }
          onChange(!enabled)
        }}
        className={`border-glass-border text-ink-muted hover:text-ink inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition ${enabled ? 'border-flow/50 bg-flow/10 text-flow' : ''}`}
      >
        {enabled ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
        Browser voice {enabled ? 'on' : 'off'}
      </button>
    </span>
  )
}
