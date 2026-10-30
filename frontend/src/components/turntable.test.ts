import { describe, expect, it } from 'vitest'
import { LABORATORY_STATIONS } from '../content/homepage'
import { neighborIndex, selectIndex, stationAnnouncement, stationCount, stationIndex } from './turntable'

describe('laboratory stations', () => {
  it('lists the five workstations in rotation order', () => {
    expect(LABORATORY_STATIONS.map((station) => station.id)).toEqual([
      'lab',
      'experiment',
      'lens',
      'coach',
      'solver',
    ])
  })

  it('maps every station to a real action, never a fake page', () => {
    for (const station of LABORATORY_STATIONS) {
      expect(['lab', 'experiment', 'lens', 'scroll']).toContain(station.action)
      expect(station.title.length).toBeGreaterThan(0)
      expect(station.description.length).toBeGreaterThan(0)
      expect(station.evidence.length).toBeGreaterThan(0)
      expect(station.actionLabel.length).toBeGreaterThan(0)
    }
    expect(LABORATORY_STATIONS.find((station) => station.id === 'coach')?.action).toBe('scroll')
    expect(LABORATORY_STATIONS.find((station) => station.id === 'solver')?.action).toBe('experiment')
  })

  it('never claims future laboratories are implemented', () => {
    const copy = JSON.stringify(LABORATORY_STATIONS).toLowerCase()
    expect(copy).not.toContain('biology')
    expect(copy).not.toContain('chemistry')
  })

  it('keeps the solver copy deterministic, never AI-like', () => {
    const solver = LABORATORY_STATIONS.find((station) => station.id === 'solver')
    expect(solver?.description).toContain('Calculates')
    expect(solver?.evidence).toBe('Measured, not guessed')
  })
})

describe('turntable rotation', () => {
  it('wraps around both ends', () => {
    expect(stationCount()).toBe(5)
    expect(neighborIndex(0, -1)).toBe(4)
    expect(neighborIndex(4, 1)).toBe(0)
    expect(neighborIndex(2, 1)).toBe(3)
    expect(neighborIndex(2, -1)).toBe(1)
  })

  it('selects directly by index and ignores out-of-range requests', () => {
    expect(selectIndex(0, 3)).toBe(3)
    expect(selectIndex(1, -1)).toBe(1)
    expect(selectIndex(1, 5)).toBe(1)
    expect(selectIndex(1, Number.NaN)).toBe(1)
  })

  it('resolves station ids to indexes', () => {
    expect(stationIndex('lab')).toBe(0)
    expect(stationIndex('solver')).toBe(4)
  })

  it('announces the selected station accessibly', () => {
    expect(stationAnnouncement(2)).toBe(
      'Reality Lens selected. Bring a real circuit diagram into the laboratory, review the proposed model, and test it.',
    )
  })
})
