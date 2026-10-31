import { describe, expect, it } from 'vitest'
import type { SimulateResult } from '../api/client'
import { resultPanel, showTriptych } from './triptych'

const SOLVED = {
  ok: true,
  components: {},
  error_code: null,
} as unknown as SimulateResult

const REJECTED = {
  ok: false,
  components: {},
  error_code: 'DANGLING_TERMINAL',
} as unknown as SimulateResult

describe('triptych gating', () => {
  it('shows only after confirmation and a solver run', () => {
    expect(showTriptych(false, SOLVED)).toBe(false)
    expect(showTriptych(true, null)).toBe(false)
    expect(showTriptych(false, null)).toBe(false)
    expect(showTriptych(true, SOLVED)).toBe(true)
    // A rejection is still a measured outcome worth showing.
    expect(showTriptych(true, REJECTED)).toBe(true)
  })

  it('separates measured numbers from validator rejections', () => {
    expect(resultPanel(SOLVED)).toBe('numbers')
    expect(resultPanel(REJECTED)).toBe('invalid')
  })
})
