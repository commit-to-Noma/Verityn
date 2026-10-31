import { describe, expect, it } from 'vitest'
import { closedSwitchNotice, nextTerminalInstruction } from './terminalGuidance'

describe('nextTerminalInstruction', () => {
  const nodes = [
    { id: 'B1', kind: 'battery' },
    { id: 'L1', kind: 'bulb' },
    { id: 'S1', kind: 'switch' },
  ]

  it('uses learner-friendly part names and numbers', () => {
    expect(nextTerminalInstruction(['B1.b', 'L1.b'], nodes)).toBe(
      'Next, connect the b terminal on Battery one to the b terminal on Light one.',
    )
  })

  it('describes multiple open terminals without internal-only IDs', () => {
    expect(nextTerminalInstruction(['S1.a', 'S1.b', 'L1.b'], nodes)).toBe(
      'Open terminals: the a terminal on Switch one, the b terminal on Switch one, the b terminal on Light one. Connect the right terminals to complete the path.',
    )
  })

  it('returns no instruction when every terminal is connected', () => {
    expect(nextTerminalInstruction([], nodes)).toBe('')
  })
})

describe('closedSwitchNotice', () => {
  const closed = [{ id: 'S1', closed: true }]
  const open = [{ id: 'S1', closed: false }]

  it('names the closed switch on open-switch stages after a run', () => {
    expect(closedSwitchNotice(closed, true, true, false)).toBe(
      'S1 is closed, but this challenge tests the open switch. Open it and press Test again to compare with your prediction.',
    )
  })

  it('stays silent when the switch is open', () => {
    expect(closedSwitchNotice(open, true, true, false)).toBeNull()
  })

  it('stays silent off open-switch stages, before a run, or mid-demonstration', () => {
    expect(closedSwitchNotice(closed, false, true, false)).toBeNull()
    expect(closedSwitchNotice(closed, true, false, false)).toBeNull()
    expect(closedSwitchNotice(closed, true, true, true)).toBeNull()
  })
})
