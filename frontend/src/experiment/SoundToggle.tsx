import { useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { isSoundEnabled, setSoundEnabled } from './sound'

/** Bench sound switch; the bay hero docks it beside the simulator status. */
export default function SoundToggle() {
  const [on, setOn] = useState(isSoundEnabled)
  const Icon = on ? Volume2 : VolumeX
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Mute bench sounds' : 'Unmute bench sounds'}
      onClick={() => {
        const next = !on
        setOn(next)
        setSoundEnabled(next)
      }}
      className="border-glass-border flex min-h-[44px] shrink-0 items-center gap-2 rounded-[10px] border px-3 text-sm font-medium"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {on ? 'Sound on' : 'Muted'}
    </button>
  )
}
