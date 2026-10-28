import { describe, expect, it } from 'vitest'
import {
  COACH_ACTIONS,
  describeDemonstration,
  offerFromActions,
  parseCoachAction,
  previewTargets,
  validateServerActions,
} from './actions'

describe('coach action vocabulary', () => {
  it('contains exactly the three approved actions', () => {
    expect([...COACH_ACTIONS]).toEqual(['open_switch', 'close_switch', 'highlight_path'])
  })

  it('parses each approved action', () => {
    for (const action of COACH_ACTIONS) {
      expect(parseCoachAction(action)).toBe(action)
    }
  })

  it.each([
    ['unknown action', 'delete_circuit'],
    ['empty string', ''],
    ['wrong case', 'Open_Switch'],
    ['leading space', ' open_switch'],
    ['null', null],
    ['number', 7],
    ['object', { action: 'open_switch' }],
    ['array', ['open_switch']],
  ])('rejects %s', (_label, value) => {
    expect(parseCoachAction(value)).toBeNull()
  })

  it('describes each demonstration deterministically', () => {
    expect(describeDemonstration({ action: 'open_switch', target: 'S1' })).toBe(
      'Coach wants to open S1 to demonstrate the break in the loop.',
    )
    expect(describeDemonstration({ action: 'close_switch', target: 'S1' })).toBe(
      'Coach wants to close S1 to demonstrate the completed loop.',
    )
    expect(describeDemonstration({ action: 'highlight_path', target: 'L1' })).toBe(
      'Coach wants to highlight L1 on the diagram.',
    )
  })
})

describe('server action validation', () => {
  const parts = [
    { id: 'B1', kind: 'battery', closed: true },
    { id: 'S1', kind: 'switch', closed: false },
    { id: 'L1', kind: 'bulb', closed: true },
  ] as const

  it('accepts the validated open-switch demonstration', () => {
    const live = parts.map((part) => ({ ...part }))
    const { accepted, rejected } = validateServerActions(
      [
        { type: 'highlight_component', componentId: 'S1' },
        { type: 'set_switch_state', componentId: 'S1', closed: true },
        { type: 'show_measurement', componentId: 'L1' },
      ],
      live,
    )
    expect(rejected).toBe(0)
    expect(accepted).toHaveLength(3)
  })

  it('rejects unknown targets, wrong kinds, and no-op flips', () => {
    const live = parts.map((part) => ({ ...part }))
    const { accepted, rejected } = validateServerActions(
      [
        { type: 'highlight_component', componentId: 'S9' },
        { type: 'set_switch_state', componentId: 'L1', closed: true },
        { type: 'set_switch_state', componentId: 'S1', closed: false },
        { type: 'highlight_terminal', componentId: 'S1' },
      ],
      live,
    )
    expect(accepted).toEqual([])
    expect(rejected).toBe(4)
  })

  it('offers a flip first, then a highlight, then the fallback', () => {
    const fallback = { action: 'highlight_path', target: 'L1' } as const
    expect(
      offerFromActions([{ type: 'set_switch_state', componentId: 'S1', closed: true }], fallback),
    ).toEqual({ action: 'close_switch', target: 'S1' })
    expect(
      offerFromActions([{ type: 'pulse_current_path', componentId: 'L1' }], fallback),
    ).toEqual({ action: 'highlight_path', target: 'L1' })
    expect(offerFromActions([{ type: 'show_measurement', componentId: 'L1' }], fallback)).toBe(
      fallback,
    )
    expect(offerFromActions([], null)).toBeNull()
  })

  it('collects preview targets without duplicates', () => {
    expect(
      previewTargets([
        { type: 'highlight_component', componentId: 'S1' },
        { type: 'set_switch_state', componentId: 'S1', closed: true },
        { type: 'show_measurement', componentId: 'L1' },
      ]),
    ).toEqual(['S1'])
  })
})
