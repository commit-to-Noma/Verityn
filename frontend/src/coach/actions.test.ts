import { describe, expect, it } from 'vitest'
import { COACH_ACTIONS, describeDemonstration, parseCoachAction } from './actions'

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
