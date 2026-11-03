import type { LessonSeed } from '../lessons/lesson'

/** A starter bench: a real seed for the shared canvas, never a fake result. */
export interface ExperimentPreset {
  id: string
  title: string
  tagline: string
  /** Learning prompt shown on load; the learner is never forced to answer. */
  prompt: string
  seed: LessonSeed
  /** Documented solver outcome, verified by probe (see TEST_PLAN §8). */
  expected: string
}

export const EXPERIMENT_PRESETS: ExperimentPreset[] = [
  {
    id: 'light-bulb',
    title: 'Light a bulb',
    tagline: 'Complete loop → current flows → bulb lights',
    prompt: 'Close the loop and watch what the simulator measures. What carries the current?',
    seed: {
      nodes: [
        { id: 'B1', kind: 'battery', x: 230, y: 30 },
        { id: 'S1', kind: 'switch', closed: true, x: 40, y: 160 },
        { id: 'L1', kind: 'bulb', x: 230, y: 290 },
      ],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'S1', targetTerminal: 'a' },
        { id: 'W2', source: 'S1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'a' },
        { id: 'W3', source: 'B1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' },
      ],
    },
    expected: 'L1 0.6 A, 3.6 W, lit',
  },
  {
    id: 'polarity-duel',
    title: 'Polarity Duel',
    tagline: 'Two batteries push opposite ways → 0 V standoff',
    prompt:
      'Two batteries, one bulb — and darkness. Double-click a battery to flip its polarity, then run again: 0 V becomes 12 V.',
    seed: {
      nodes: [
        { id: 'B1', kind: 'battery', volts: 6, x: 80, y: 30 },
        { id: 'B2', kind: 'battery', volts: 6, x: 380, y: 30 },
        { id: 'S1', kind: 'switch', closed: true, x: 40, y: 160 },
        { id: 'L1', kind: 'bulb', x: 230, y: 290 },
      ],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'b', target: 'B2', targetTerminal: 'b' },
        { id: 'W2', source: 'B1', sourceTerminal: 'a', target: 'S1', targetTerminal: 'a' },
        { id: 'W3', source: 'S1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'a' },
        { id: 'W4', source: 'L1', sourceTerminal: 'b', target: 'B2', targetTerminal: 'a' },
      ],
    },
    expected: 'L1 0.0 A dark while opposing; 12 V 1.2 A lit after flipping one battery',
  },
  {
    id: 'time-bomb',
    title: 'Time Bomb',
    tagline: 'Dump 24 V into one bulb → flash, pop, darkness',
    prompt: 'One bulb, one 24 V battery. Press Test and stand back.',
    seed: {
      nodes: [
        { id: 'B1', kind: 'battery', volts: 24, x: 230, y: 30 },
        { id: 'S1', kind: 'switch', closed: true, x: 40, y: 160 },
        { id: 'L1', kind: 'bulb', x: 230, y: 290 },
      ],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'S1', targetTerminal: 'a' },
        { id: 'W2', source: 'S1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'a' },
        { id: 'W3', source: 'B1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' },
      ],
    },
    expected: 'L1 explodes on the first run (24 V past the 18 V blow point)',
  },
  {
    id: 'dim-duo',
    title: 'Dim Duo',
    tagline: 'Two bulbs split one battery → both dim',
    prompt:
      'Each bulb gets half the push. Run it, then add a second battery in series — what changes?',
    seed: {
      nodes: [
        { id: 'B1', kind: 'battery', volts: 6, x: 230, y: 30 },
        { id: 'L1', kind: 'bulb', x: 60, y: 160 },
        { id: 'L2', kind: 'bulb', x: 230, y: 290 },
      ],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'L1', targetTerminal: 'a' },
        { id: 'W2', source: 'L1', sourceTerminal: 'b', target: 'L2', targetTerminal: 'a' },
        { id: 'W3', source: 'L2', sourceTerminal: 'b', target: 'B1', targetTerminal: 'b' },
      ],
    },
    expected: 'L1, L2 0.3 A, 0.9 W each, both dim-lit',
  },
  {
    id: 'shorted-battery',
    title: 'The Forbidden Wire',
    tagline: 'Wire a battery straight back to itself → refused',
    prompt:
      'No bulb, no switch — just a wire across the terminals. Run it and watch the simulator refuse: red glow, zap, and the reason why.',
    seed: {
      nodes: [{ id: 'B1', kind: 'battery', x: 230, y: 160 }],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'B1', targetTerminal: 'b' },
      ],
    },
    expected: 'rejected SHORTED_BATTERY',
  },
  {
    id: 'overload-bulb',
    title: 'Overwork the bulb',
    tagline: 'Loaded hot at 18 V → watch the bulb strain',
    prompt:
      'This bench loads past the 12 V rating. Run it and watch the bulb strain, then drop to 12 V for intact and push past 18 V to blow it.',
    seed: {
      nodes: [
        { id: 'B1', kind: 'battery', volts: 18, x: 230, y: 30 },
        { id: 'S1', kind: 'switch', closed: true, x: 40, y: 160 },
        { id: 'L1', kind: 'bulb', x: 230, y: 290 },
      ],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'S1', targetTerminal: 'a' },
        { id: 'W2', source: 'S1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'a' },
        { id: 'W3', source: 'B1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' },
      ],
    },
    expected: 'L1 1.8 A, 32.4 W, overworked at 18 V; 12 V intact; past 18 V exploded',
  },
]
