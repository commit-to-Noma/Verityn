import { describe, expect, it } from 'vitest'
import { openTerminals } from './openTerminals'

describe('openTerminals', () => {
  it('lists only unwired component terminals', () => {
    expect(
      openTerminals(
        [{ id: 'B1' }, { id: 'S1' }, { id: 'L1' }],
        [
          { source: 'B1', sourceHandle: 'a', target: 'S1', targetHandle: 'a' },
          { source: 'S1', sourceHandle: 'b', target: 'L1', targetHandle: 'a' },
        ],
      ),
    ).toEqual(['B1.b', 'L1.b'])
  })

  it('handles an empty canvas and missing handle IDs', () => {
    expect(openTerminals([], [])).toEqual([])
    expect(openTerminals([{ id: 'B1' }], [
      { source: 'B1', sourceHandle: null, target: 'B1', targetHandle: 'b' },
    ])).toEqual(['B1.a'])
  })
})
