import { describe, expect, test } from 'vitest'
import {
  DEMO_BEATS,
  IDLE_DEMO,
  demoBeatLabel,
  demoStatusLabel,
  demoStepLabel,
  demoTransition,
} from './machine'

describe('demo machine', () => {
  test('starts at the first beat, playing', () => {
    const state = demoTransition(IDLE_DEMO, { type: 'start' })
    expect(state).toMatchObject({ active: true, paused: false, beat: 'predict', complete: false })
    expect(demoStatusLabel(state)).toBe('Demo playing')
    expect(demoStepLabel(state)).toBe('Step 1 of 7')
  })

  test('advances forward through every beat in order', () => {
    let state = demoTransition(IDLE_DEMO, { type: 'start' })
    const seen = [state.beat]
    for (const beat of ['build', 'reality', 'coach', 'demonstrate', 'solo', 'finale'] as const) {
      state = demoTransition(state, { type: 'advanced', beat })
      seen.push(state.beat)
    }
    expect(seen).toEqual(DEMO_BEATS.map((entry) => entry.id))
    expect(demoStepLabel(state)).toBe('Step 7 of 7')
    expect(demoBeatLabel('coach')).toBe('Coach')
  })

  test('ignores backward and repeated advances', () => {
    let state = demoTransition(IDLE_DEMO, { type: 'start' })
    state = demoTransition(state, { type: 'advanced', beat: 'coach' })
    expect(demoTransition(state, { type: 'advanced', beat: 'reality' }).beat).toBe('coach')
    expect(demoTransition(state, { type: 'advanced', beat: 'coach' })).toBe(state)
  })

  test('pause and resume hold the beat', () => {
    let state = demoTransition(IDLE_DEMO, { type: 'start' })
    state = demoTransition(state, { type: 'advanced', beat: 'build' })
    state = demoTransition(state, { type: 'pause' })
    expect(state.paused).toBe(true)
    expect(state.beat).toBe('build')
    expect(demoStatusLabel(state)).toBe('Demo paused')
    state = demoTransition(state, { type: 'resume' })
    expect(state.paused).toBe(false)
    expect(state.beat).toBe('build')
    expect(demoStatusLabel(state)).toBe('Demo playing')
  })

  test('skip bumps the hurry signal without moving the beat', () => {
    let state = demoTransition(IDLE_DEMO, { type: 'start' })
    state = demoTransition(state, { type: 'advanced', beat: 'reality' })
    const signal = state.signal
    state = demoTransition(state, { type: 'skip' })
    expect(state.beat).toBe('reality')
    expect(state.signal).toBe(signal + 1)
    expect(state.paused).toBe(false)
  })

  test('takeover and exit stop the demo but keep the state object', () => {
    let state = demoTransition(IDLE_DEMO, { type: 'start' })
    state = demoTransition(state, { type: 'advanced', beat: 'solo' })
    state = demoTransition(state, { type: 'takeover' })
    expect(state.active).toBe(false)
    expect(state.beat).toBe('solo')
    state = demoTransition(state, { type: 'exit' })
    expect(state.active).toBe(false)
  })

  test('replay restarts cleanly from the first beat', () => {
    let state = demoTransition(IDLE_DEMO, { type: 'start' })
    state = demoTransition(state, { type: 'advanced', beat: 'finale' })
    state = demoTransition(state, { type: 'finish' })
    expect(state.complete).toBe(true)
    state = demoTransition(state, { type: 'replay' })
    expect(state).toMatchObject({ active: true, paused: false, beat: 'predict', complete: false })
  })

  test('finish completes the demo and freezes pause/skip/advance', () => {
    let state = demoTransition(IDLE_DEMO, { type: 'start' })
    state = demoTransition(state, { type: 'finish' })
    expect(demoStatusLabel(state)).toBe('Demo complete')
    expect(demoStepLabel(state)).toBe('Step 7 of 7')
    expect(demoTransition(state, { type: 'pause' })).toBe(state)
    expect(demoTransition(state, { type: 'skip' })).toBe(state)
    expect(demoTransition(state, { type: 'advanced', beat: 'solo' })).toBe(state)
  })

  test('idle demo ignores pause, resume, skip, and advance', () => {
    expect(demoTransition(IDLE_DEMO, { type: 'pause' })).toBe(IDLE_DEMO)
    expect(demoTransition(IDLE_DEMO, { type: 'resume' })).toBe(IDLE_DEMO)
    expect(demoTransition(IDLE_DEMO, { type: 'skip' })).toBe(IDLE_DEMO)
    expect(demoTransition(IDLE_DEMO, { type: 'advanced', beat: 'build' })).toBe(IDLE_DEMO)
    expect(demoStatusLabel(IDLE_DEMO)).toBe('')
  })
})
