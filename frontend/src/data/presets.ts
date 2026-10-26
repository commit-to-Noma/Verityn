/** Example circuits for the integration milestone, verified against the solver. */

import type { Claim, Netlist } from '../api/client'

export interface PresetOption {
  label: string
  claims: Claim[]
}

export interface Preset {
  id: string
  title: string
  description: string
  netlist: Netlist
  options: PresetOption[]
}

export const PRESETS: Preset[] = [
  {
    id: 'lit-bulb',
    title: 'Lit bulb',
    description: 'A 6 V battery across one bulb.',
    netlist: {
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
        { id: 'L1', type: 'bulb', a: 'p', b: '0' },
      ],
    },
    options: [
      { label: 'Bulb lights', claims: [{ type: 'lit', component: 'L1', value: true }] },
      { label: 'Bulb stays dark', claims: [{ type: 'lit', component: 'L1', value: false }] },
    ],
  },
  {
    id: 'series-pair',
    title: 'Two bulbs in series',
    description: 'A 6 V battery across bulbs L1 and L2.',
    netlist: {
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
        { id: 'L1', type: 'bulb', a: 'p', b: 'm' },
        { id: 'L2', type: 'bulb', a: 'm', b: '0' },
      ],
    },
    options: [
      {
        label: 'Both bulbs equally bright',
        claims: [{ type: 'compare_brightness', a: 'L1', b: 'L2', relation: 'equal' }],
      },
      {
        label: 'Bulb L1 brighter',
        claims: [{ type: 'compare_brightness', a: 'L1', b: 'L2', relation: 'brighter' }],
      },
      {
        label: 'Bulb L2 brighter',
        claims: [{ type: 'compare_brightness', a: 'L2', b: 'L1', relation: 'brighter' }],
      },
      {
        label: 'Neither lights',
        claims: [
          { type: 'lit', component: 'L1', value: false },
          { type: 'lit', component: 'L2', value: false },
        ],
      },
    ],
  },
  {
    id: 'open-switch',
    title: 'Open switch',
    description: 'A 5 V battery, an open switch, and one bulb.',
    netlist: {
      components: [
        { id: 'B1', type: 'battery', volts: 5, a: 'p', b: '0' },
        { id: 'S1', type: 'switch', closed: false, a: 'p', b: 'n1' },
        { id: 'L1', type: 'bulb', a: 'n1', b: '0' },
      ],
    },
    options: [
      { label: 'Bulb stays dark', claims: [{ type: 'lit', component: 'L1', value: false }] },
      { label: 'Bulb lights', claims: [{ type: 'lit', component: 'L1', value: true }] },
    ],
  },
  {
    id: 'shorted-battery',
    title: 'Shorted battery',
    description: 'A wire straight across a 6 V battery.',
    netlist: {
      components: [
        { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
        { id: 'W1', type: 'wire', a: 'p', b: '0' },
      ],
    },
    options: [
      { label: 'Bulb L1 lights', claims: [{ type: 'lit', component: 'L1', value: true }] },
    ],
  },
]
