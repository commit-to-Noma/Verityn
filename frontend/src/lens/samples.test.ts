import { describe, expect, it } from 'vitest'
import { LENS_SAMPLES } from './samples'

describe('LENS_SAMPLES', () => {
  it('ships exactly the two spike-verified samples', () => {
    expect(LENS_SAMPLES.map((sample) => sample.id).sort()).toEqual([
      'textbook-loop',
      'workbench-switch',
    ])
  })

  it('keeps every box, path, and switch rect inside its image', () => {
    for (const sample of LENS_SAMPLES) {
      for (const box of [sample.boxes.battery, sample.boxes.bulb]) {
        expect(box.left).toBeGreaterThanOrEqual(0)
        expect(box.top).toBeGreaterThanOrEqual(0)
        expect(box.right).toBeLessThanOrEqual(sample.width)
        expect(box.bottom).toBeLessThanOrEqual(sample.height)
        expect(box.confidence).toBeGreaterThanOrEqual(0)
        expect(box.confidence).toBeLessThanOrEqual(1)
      }
      expect(sample.paths.length).toBeGreaterThanOrEqual(1)
      for (const path of sample.paths) {
        expect(path.length).toBeGreaterThanOrEqual(2)
        for (const [x, y] of path) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(sample.width)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(sample.height)
        }
      }
      if (sample.switch) {
        expect(sample.switch.left).toBeGreaterThanOrEqual(0)
        expect(sample.switch.right).toBeLessThanOrEqual(sample.width)
        expect(sample.switch.top).toBeGreaterThanOrEqual(0)
        expect(sample.switch.bottom).toBeLessThanOrEqual(sample.height)
      }
    }
  })

  it('grounds every claim and switch id in its netlist', () => {
    for (const sample of LENS_SAMPLES) {
      const ids = sample.netlist.components.map((component) => component.id)
      expect(ids).toContain(sample.claim.component)
      expect(ids).toContain('B1')
      expect(ids).toContain('L1')
      if (sample.switch) {
        expect(ids).toContain(sample.switch.id)
        expect(sample.expectedOpen).not.toBeNull()
      } else {
        expect(sample.expectedOpen).toBeNull()
      }
      expect(sample.guide.trim()).not.toBe('')
      expect(sample.modelNote.trim()).not.toBe('')
    }
  })
})
