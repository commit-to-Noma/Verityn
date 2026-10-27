import { useState } from 'react'
import CircuitCanvas from './components/CircuitCanvas'
import EvaluatePanel from './components/EvaluatePanel'
import HealthStatus from './components/HealthStatus'
import PredictionScreen from './components/PredictionScreen'
import SimulatePanel from './components/SimulatePanel'
import { PRESETS } from './data/presets'
import { L1 } from './lessons/l1'
import type { Prediction } from './lessons/lesson'
import { CHOICE_LABELS } from './lessons/lesson'

export default function App() {
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [prediction, setPrediction] = useState<Prediction | null>(null)
  const preset = PRESETS.find((option) => option.id === presetId) ?? PRESETS[0]

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 pb-12">
      <header className="flex h-14 shrink-0 items-center">
        <p className="text-xl font-semibold tracking-tight">Verityn</p>
        <p className="text-ink-muted ml-3 text-sm">Predict. Build. Reality check.</p>
      </header>
      <main className="flex flex-col gap-8">
        <HealthStatus />
        {prediction === null ? (
          <PredictionScreen pack={L1} onComplete={setPrediction} />
        ) : (
          <>
            <div className="border-glass-border rounded-2xl border p-4">
              <p className="text-sm">
                <span className="text-ink-muted">Your prediction: </span>
                {CHOICE_LABELS[prediction.choice]}
                {prediction.why.trim() === '' ? '' : ` — “${prediction.why.trim()}”`}
              </p>
              <p className="text-ink-muted mt-1 text-sm">{L1.fix.hint}</p>
            </div>
            <CircuitCanvas seed={L1.seed} />
          </>
        )}
        <SimulatePanel preset={preset} onSelectPreset={setPresetId} />
        <EvaluatePanel key={preset.id} preset={preset} />
      </main>
    </div>
  )
}
