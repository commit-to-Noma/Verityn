import { repeatCoach } from './coachVoice'

/** Keeps a manual replay control for the latest coach message. */
export default function SpeakButton({ enabled = false }: { enabled?: boolean }) {
  if (!enabled) {
    return null
  }
  return (
    <button
      type="button"
      onClick={() => repeatCoach()}
      aria-label="Repeat coach message"
      title="Repeat the latest coach message (browser voice, not Meta)"
      className="border-glass-border inline-flex min-h-[44px] items-center gap-1 rounded-[10px] border px-3 text-xs font-medium"
    >
      Repeat
    </button>
  )
}
