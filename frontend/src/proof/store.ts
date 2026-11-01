import { useEffect, useState } from 'react'

/** Proof mode: minimal lab by default, solver evidence plus AI trace on demand. */
let proof =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('proof')
const listeners = new Set<() => void>()

export function proofMode(): boolean {
  return proof
}

export function setProofMode(next: boolean): void {
  if (proof === next) {
    return
  }
  proof = next
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeProofMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useProofMode(): boolean {
  const [current, setCurrent] = useState(proof)
  useEffect(() => subscribeProofMode(() => setCurrent(proof)), [])
  return current
}
