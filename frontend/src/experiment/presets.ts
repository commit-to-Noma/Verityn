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
    id: 'parallel-power',
    title: 'Parallel Power',
    tagline: 'Three bulbs across one battery → all lit, full brightness',
    prompt:
      'Three bulbs share the same battery terminals. In series they would dim; in parallel each gets the full 6 V. Run it and compare.',
    seed: {
      nodes: [
        { id: 'B1', kind: 'battery', volts: 6, x: 300, y: 30 },
        { id: 'L1', kind: 'bulb', x: 60, y: 160 },
        { id: 'L2', kind: 'bulb', x: 300, y: 290 },
        { id: 'L3', kind: 'bulb', x: 540, y: 160 },
      ],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'L1', targetTerminal: 'a' },
        { id: 'W2', source: 'B1', sourceTerminal: 'a', target: 'L2', targetTerminal: 'a' },
        { id: 'W3', source: 'B1', sourceTerminal: 'a', target: 'L3', targetTerminal: 'a' },
        { id: 'W4', source: 'L1', sourceTerminal: 'b', target: 'B1', targetTerminal: 'b' },
        { id: 'W5', source: 'L2', sourceTerminal: 'b', target: 'B1', targetTerminal: 'b' },
        { id: 'W6', source: 'L3', sourceTerminal: 'b', target: 'B1', targetTerminal: 'b' },
      ],
    },
    expected: 'L1, L2, L3 0.6 A, 3.6 W each, all lit',
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
  {
    id: 'overload-bulb',
    title: 'Overwork the bulb',
    tagline: 'Stack batteries → find where intact ends and the bulb blows',
    prompt:
      'Run it with one battery first. Add a second in series and run again  -  still intact at 12 V. Add a third for 18 V, then a fourth: what happens past 18 V?',
    seed: {
      nodes: [
        { id: 'B1', kind: 'battery', volts: 6, x: 230, y: 30 },
        { id: 'S1', kind: 'switch', closed: true, x: 40, y: 160 },
        { id: 'L1', kind: 'bulb', x: 230, y: 290 },
      ],
      edges: [
        { id: 'W1', source: 'B1', sourceTerminal: 'a', target: 'S1', targetTerminal: 'a' },
        { id: 'W2', source: 'S1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'a' },
        { id: 'W3', source: 'B1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' },
      ],
    },
    expected: 'L1 0.6 A, 3.6 W, intact; 12 V intact; 18 V overworked; past 18 V exploded',
  },
]
