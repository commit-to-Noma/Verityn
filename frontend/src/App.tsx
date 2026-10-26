import { useState } from 'react'
import EvaluatePanel from './components/EvaluatePanel'
import HealthStatus from './components/HealthStatus'
import SimulatePanel from './components/SimulatePanel'
import { PRESETS } from './data/presets'

export default function App() {
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const preset = PRESETS.find((option) => option.id === presetId) ?? PRESETS[0]

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 pb-12">
      <header className="flex h-14 shrink-0 items-center">
        <p className="text-xl font-semibold tracking-tight">Verityn</p>
        <p className="text-ink-muted ml-3 text-sm">Predict. Build. Prove.</p>
      </header>
      <main className="flex flex-col gap-8">
        <HealthStatus />
        <SimulatePanel preset={preset} onSelectPreset={setPresetId} />
        <EvaluatePanel key={preset.id} preset={preset} />
      </main>
    </div>
  )
}
