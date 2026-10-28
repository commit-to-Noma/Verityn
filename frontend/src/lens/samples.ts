/** Verified Reality Lens samples, shared with the backend pack tests. */

import type { Netlist } from '../api/client'
import pack from '../../../src/verityn/lessons/lens_samples.json'

export interface LensBox {
  left: number
  top: number
  right: number
  bottom: number
  confidence: number
}

export interface LensSwitch {
  id: string
  left: number
  top: number
  right: number
  bottom: number
}

export interface LensExpected {
  ok: true
  lit: boolean
  component: string
  current: number
  power: number
}

export interface LensSample {
  id: string
  title: string
  image: string
  width: number
  height: number
  source: string
  modelNote: string
  boxes: { battery: LensBox; bulb: LensBox }
  /** Polylines in image pixels, authored in conventional-current order. */
  paths: number[][][]
  switch: LensSwitch | null
  netlist: Netlist
  expected: LensExpected
  expectedOpen: LensExpected | null
  question: string
  claim: { type: string; component: string }
  guide: string
}

export const LENS_SAMPLES: LensSample[] = (
  pack as unknown as { samples: LensSample[] }
).samples
