import { describe, expect, it } from 'vitest'
import { toggleCompare } from './compare'

describe('toggleCompare', () => {
  it('adds the first and second picks', () => {
    expect(toggleCompare([], 'a')).toEqual(['a'])
    expect(toggleCompare(['a'], 'b')).toEqual(['a', 'b'])
  })

  it('toggles a picked sample back off', () => {
    expect(toggleCompare(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('retires the oldest pick when a third arrives', () => {
    expect(toggleCompare(['a', 'b'], 'c')).toEqual(['b', 'c'])
  })
})
