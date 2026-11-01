import { describe, expect, it } from 'vitest'
import { closedSwitchNotice, nextTerminalInstruction } from './terminalGuidance'

describe('nextTerminalInstruction', () => {
  const nodes = [
    { id: 'B1', kind: 'battery' },
    { id: 'L1', kind: 'bulb' },
    { id: 'S1', kind: 'switch' },
  ]

  it('gives a plain-language direction between the exact loose dots', () => {
    expect(nextTerminalInstruction(['B1.b', 'L1.b'], nodes)).toBe(
      "Drag from the battery's right dot to the bulb's right dot.",
    )
  })

  it('describes multiple open terminals without internal-only IDs', () => {
    expect(nextTerminalInstruction(['S1.a', 'S1.b', 'L1.b'], nodes)).toBe(
      'Connect the loose dots to complete the loop.',
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
      'The switch is closed, but this challenge uses it open. Open the switch and test again to compare with your prediction.',
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
