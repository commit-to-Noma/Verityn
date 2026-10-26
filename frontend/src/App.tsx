import HealthStatus from './components/HealthStatus'

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4">
      <header className="flex h-14 shrink-0 items-center">
        <p className="text-xl font-semibold tracking-tight">Verityn</p>
        <p className="text-ink-muted ml-3 text-sm">Predict. Build. Prove.</p>
      </header>
      <main className="flex flex-1 flex-col justify-center gap-4 py-8">
        <h1 className="text-xl font-semibold">Project scaffold</h1>
        <p className="text-ink-muted max-w-xl text-base">
          Milestone 1: the frontend talks to the Flask backend. Circuit building, predictions,
          and the AI coach arrive in later milestones.
        </p>
        <HealthStatus />
      </main>
    </div>
  )
}
