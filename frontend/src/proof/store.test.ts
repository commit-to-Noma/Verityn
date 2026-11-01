import { describe, expect, it } from 'vitest'
import { proofMode, setProofMode, subscribeProofMode } from './store'

describe('proof store', () => {
  it('is off unless enabled, and notifies subscribers', () => {
    setProofMode(false)
    expect(proofMode()).toBe(false)
    let calls = 0
    const unsubscribe = subscribeProofMode(() => {
      calls += 1
    })
    setProofMode(true)
    expect(proofMode()).toBe(true)
    expect(calls).toBe(1)
    setProofMode(true)
    expect(calls).toBe(1)
    unsubscribe()
    setProofMode(false)
    expect(calls).toBe(1)
    expect(proofMode()).toBe(false)
  })
})
