import { describe, expect, it } from 'vitest'
import { friendlyComponentName } from './componentNames'

describe('friendlyComponentName', () => {
  it('translates canvas ids into plain words with numbers', () => {
    expect(friendlyComponentName('B1')).toBe('Battery 1')
    expect(friendlyComponentName('L2')).toBe('Light 2')
    expect(friendlyComponentName('S1')).toBe('Switch 1')
  })

  it('passes through shapes it does not recognize', () => {
    expect(friendlyComponentName('mystery')).toBe('mystery')
    expect(friendlyComponentName('X9')).toBe('X9')
  })
})
