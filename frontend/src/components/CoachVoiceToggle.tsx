import { Volume2, VolumeX } from 'lucide-react'
import { repeatCoach, stopCoach } from '../voice/coachVoice'

export default function CoachVoiceToggle({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  return (
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
      className={`inline-flex min-h-11 items-center gap-2 self-start rounded-full border px-3 text-sm font-medium transition ${
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
  )
}
