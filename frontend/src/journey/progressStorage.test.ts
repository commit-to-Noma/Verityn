import { describe, expect, it } from 'vitest'
import {
  JOURNEY_PROGRESS_KEY,
  JOURNEY_PROGRESS_VERSION,
  clearJourneyCheckpoint,
  readJourneyCheckpoint,
  saveJourneyCheckpoint,
  type JourneyCheckpoint,
} from './progressStorage'

function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => items.delete(key),
    setItem: (key, value) => items.set(key, value),
  }
}

const checkpoint: JourneyCheckpoint = {
  version: JOURNEY_PROGRESS_VERSION,
  savedAt: 1_000,
  l1Prediction: { lessonId: 'L1', choice: 'no', why: 'Open gap.' },
  realityStarted: false,
  realityPrediction: null,
  realitySession: null,
  transferStarted: false,
  transferPrediction: null,
  transferDone: false,
  snapshots: {},
}

describe('journey progress storage', () => {
  it('saves and reads a valid checkpoint', () => {
    const storage = memoryStorage()
    const withEvidence: JourneyCheckpoint = {
      ...checkpoint,
      snapshots: {
        L1: {
          prediction: checkpoint.l1Prediction,
          question: 'Will current flow?',
          netlist: {
            components: [
              { id: 'B1', type: 'battery', a: 'B1.a', b: 'B1.b', volts: 6 },
            ],
          },
          result: {
            ok: true,
            node_voltages: {},
            components: { B1: { voltage: 6, current: 0.6, power: 3.6 } },
            error_code: null,
            error_message: '',
            component_ids: [],
            conditions: {},
            ratings: {},
          },
          verdict: { status: 'CONSISTENT', evidence: { L1: 3.6 } },
          expectedLit: null,
          coach: null,
          coachAvailable: false,
        },
      },
    }
    expect(saveJourneyCheckpoint(storage, withEvidence)).toBe(true)
    expect(readJourneyCheckpoint(storage, 1_500)).toEqual({
      status: 'available',
      checkpoint: withEvidence,
    })
  })

  it('rejects malformed, future, and expired checkpoints', () => {
    const storage = memoryStorage()
    storage.setItem(JOURNEY_PROGRESS_KEY, '{broken')
    expect(readJourneyCheckpoint(storage, 1_500).status).toBe('invalid')

    storage.setItem(
      JOURNEY_PROGRESS_KEY,
      JSON.stringify({ ...checkpoint, savedAt: 2_000 }),
    )
    expect(readJourneyCheckpoint(storage, 1_500).status).toBe('invalid')

    storage.setItem(
      JOURNEY_PROGRESS_KEY,
      JSON.stringify({ ...checkpoint, savedAt: 1 }),
    )
    expect(readJourneyCheckpoint(storage, 40 * 24 * 60 * 60 * 1000).status).toBe('invalid')

    storage.setItem(
      JOURNEY_PROGRESS_KEY,
      JSON.stringify({ ...checkpoint, savedAt: 1_000, snapshots: { L1: { broken: true } } }),
    )
    expect(readJourneyCheckpoint(storage, 1_500).status).toBe('invalid')
  })

  it('removes a saved checkpoint', () => {
    const storage = memoryStorage()
    saveJourneyCheckpoint(storage, checkpoint)
    expect(clearJourneyCheckpoint(storage)).toBe(true)
    expect(readJourneyCheckpoint(storage).status).toBe('empty')
  })
})
