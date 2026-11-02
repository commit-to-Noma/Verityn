import { describe, expect, it } from 'vitest'
import { isSoundEnabled, playClack, playPop, setSoundEnabled, startHum, stopHum } from './sound'

describe('experiment sound', () => {
  it('toggles the session flag and stays silent without audio hardware', () => {
    setSoundEnabled(false)
    expect(isSoundEnabled()).toBe(false)
    expect(() => {
      playClack()
      playPop()
      startHum(12)
      stopHum()
    }).not.toThrow()
    setSoundEnabled(true)
    expect(isSoundEnabled()).toBe(true)
    expect(() => {
      playClack()
      playPop()
      startHum(12)
      stopHum()
    }).not.toThrow()
  })

  it('ignores nonsense hum voltages', () => {
    expect(() => {
      startHum(Number.NaN)
      startHum(0)
      startHum(-6)
    }).not.toThrow()
  })
})
