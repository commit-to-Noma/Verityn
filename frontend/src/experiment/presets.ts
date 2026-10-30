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
    id: 'open-switch',
    title: 'Open the switch',
    tagline: 'Break the loop → current stops → bulb stays dark',
    prompt: 'The wiring is complete but the switch is open. Run it, then close the switch and run again.',
    seed: {
      nodes: [
        { id: 'B1', kind: 'battery', x: 230, y: 30 },
        { id: 'S1', kind: 'switch', closed: false, x: 40, y: 160 },
        { id: 'L1', kind: 'bulb', x: 230, y: 290 },
      ],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'S1', targetTerminal: 'a' },
        { id: 'W2', source: 'S1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'a' },
        { id: 'W3', source: 'B1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' },
      ],
    },
    expected: 'valid, L1 0.0 A, 0.0 W, dark',
  },
  {
    id: 'series-pair',
    title: 'Two bulbs in series',
    tagline: 'Compare how the circuit behaves when two bulbs share one path',
    prompt: 'Both bulbs share one path. How bright is each compared with a single bulb?',
    seed: {
      nodes: [
        { id: 'B1', kind: 'battery', x: 230, y: 30 },
        { id: 'L1', kind: 'bulb', x: 40, y: 160 },
        { id: 'L2', kind: 'bulb', x: 230, y: 290 },
      ],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'L1', targetTerminal: 'a' },
        { id: 'W2', source: 'L1', sourceTerminal: 'b', target: 'L2', targetTerminal: 'a' },
        { id: 'W3', source: 'L2', sourceTerminal: 'b', target: 'B1', targetTerminal: 'b' },
      ],
    },
    expected: 'L1 and L2 0.3 A, 0.9 W each, both lit',
  },
  {
    id: 'shorted-battery',
    title: 'Shorted battery',
    tagline: 'Explore why a direct wire across a battery is rejected',
    prompt: 'A wire connects the battery straight back to itself. What does the simulator say, and why?',
    seed: {
      nodes: [{ id: 'B1', kind: 'battery', x: 230, y: 160 }],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'B1', targetTerminal: 'b' },
      ],
    },
    expected: 'rejected SHORTED_BATTERY',
  },
]
