import { describe, expect, it } from 'vitest'
import { PRESETS } from './presets'

const TYPES = ['battery', 'resistor', 'bulb', 'switch', 'wire']
const RELATIONS = ['brighter', 'dimmer', 'equal']

describe('presets', () => {
  it('defines at least one preset with unique ids', () => {
    expect(PRESETS.length).toBeGreaterThan(0)
    const ids = PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of PRESETS) {
      expect(preset.id).toBeTruthy()
      expect(preset.title).toBeTruthy()
      expect(preset.description).toBeTruthy()
    }
  })

  it('holds structurally sound netlists', () => {
    for (const preset of PRESETS) {
      const ids = preset.netlist.components.map((comp) => comp.id)
      expect(ids.length).toBeGreaterThan(0)
      expect(new Set(ids).size).toBe(ids.length)
      for (const comp of preset.netlist.components) {
        expect(typeof comp.id).toBe('string')
        expect(TYPES).toContain(comp.type)
        expect(typeof comp.a).toBe('string')
        expect(typeof comp.b).toBe('string')
      }
    }
  })

  it('maps every option to well-formed v1 claims', () => {
    for (const preset of PRESETS) {
      expect(preset.options.length).toBeGreaterThan(0)
      for (const option of preset.options) {
        expect(option.label).toBeTruthy()
        expect(option.claims.length).toBeGreaterThan(0)
        for (const claim of option.claims) {
          if (claim.type === 'lit') {
            expect(typeof claim.component).toBe('string')
            expect(typeof claim.value).toBe('boolean')
          } else if (claim.type === 'compare_brightness') {
            expect(typeof claim.a).toBe('string')
            expect(typeof claim.b).toBe('string')
            expect(RELATIONS).toContain(claim.relation)
          } else {
            expect.unreachable(`unsupported claim type in ${preset.id}`)
          }
        }
      }
    }
  })
})
