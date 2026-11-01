import { proofMode, setProofMode, subscribeProofMode } from '../proof/store'
import { useEffect, useState } from 'react'

/** Header switch: minimal lab by default, solver evidence plus AI trace on. */
export default function ProofSwitch() {
  const [on, setOn] = useState(proofMode())
  useEffect(() => subscribeProofMode(() => setOn(proofMode())), [])
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Proof mode"
      title="Proof off: clean lab. Proof on: readings, evidence trace, and AI checks."
      onClick={() => setProofMode(!on)}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-sm font-medium transition ${
        on
          ? 'border-flow/50 bg-flow/10 text-flow'
          : 'border-glass-border text-ink-muted hover:text-ink'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex h-5 w-9 items-center rounded-full px-0.5 transition ${
          on ? 'justify-end bg-flow/40' : 'justify-start bg-glass-strong'
        }`}
      >
        <span className="h-4 w-4 rounded-full bg-ink" />
      </span>
      Proof
    </button>
  )
}
