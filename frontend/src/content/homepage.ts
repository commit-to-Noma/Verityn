/** Homepage copy, shared between the component and its tests. */

export const HOMEPAGE_HEADLINE = 'Imagine it. Test it. Understand it.'

export const HOMEPAGE_SUBHEAD =
  'Explore four STEM disciplines through interactive labs. Circuits are our first live Engineering module.'

export const HOMEPAGE_ENTRIES = {
  demo: 'Watch the guided walkthrough',
  startLab: 'Start your own lab',
  laboratory: 'Explore the laboratory',
  tools: 'Explore the five tools',
  realityLens: 'Open Reality Lens',
} as const

export type LaboratoryStationId = 'lab' | 'experiment' | 'lens' | 'coach' | 'solver'

export type StationAction = 'lab' | 'experiment' | 'lens' | 'scroll'

export interface LaboratoryStation {
  id: LaboratoryStationId
  title: string
  description: string
  evidence: string
  /** Truthful static details; never invented live measurements. */
  details: string[]
  actionLabel: string
  action: StationAction
}

/** The laboratory turntable, in rotation order. Single source of truth:
 * the component renders this; tests assert against this. */
export const LABORATORY_STATIONS: LaboratoryStation[] = [
  {
    id: 'lab',
    title: 'Guided Lab',
    description:
      'Predict, build, and test a circuit against measured results.',
    evidence: 'Predict → Build → Reality Check → Solo',
    details: ['Engineering · Module 1', 'Solver-verified'],
    actionLabel: HOMEPAGE_ENTRIES.startLab,
    action: 'lab',
  },
  {
    id: 'experiment',
    title: 'Experiment Bay',
    description:
      'Build freely. Change a circuit and run it whenever you’re ready.',
    evidence: 'Run · Compare · Reset',
    details: ['5 starter experiments', 'Run history'],
    actionLabel: 'Open Experiment',
    action: 'experiment',
  },
  {
    id: 'lens',
    title: 'Reality Lens',
    description:
      'Turn a circuit image into a model you can review and test.',
    evidence: 'Image → Review → Test',
    details: ['You confirm before solving', 'Meta vision'],
    actionLabel: 'Open Reality Lens',
    action: 'lens',
  },
  {
    id: 'coach',
    title: 'Meta Muse Spark',
    description:
      'A bounded coach that asks questions and points to evidence.',
    evidence: 'Prompts · Hints · Demonstrates',
    details: ['Never judges the physics', 'Grounded in measurements'],
    actionLabel: 'See how the coach works',
    action: 'scroll',
  },
  {
    id: 'solver',
    title: 'Verityn Solver',
    description:
      'The deterministic engine behind every circuit measurement.',
    evidence: 'Measured, not guessed',
    details: ['Current · Voltage · Power', 'Circuit validity'],
    actionLabel: 'Run an experiment',
    action: 'experiment',
  },
]

export type STEMFieldId = 'science' | 'technology' | 'engineering' | 'mathematics'

export interface STEMField {
  id: STEMFieldId
  title: string
  description: string
  status: 'future' | 'live'
}

/** The four connected disciplines behind Verityn's wider learning vision. */
export const STEM_FIELDS: STEMField[] = [
  {
    id: 'science',
    title: 'Science',
    description:
      'Model a natural system, predict what will change, then compare your idea with simulated results.',
    status: 'future',
  },
  {
    id: 'technology',
    title: 'Technology',
    description:
      'Design a useful tool, test how it behaves, and improve it through repeated trials.',
    status: 'future',
  },
  {
    id: 'engineering',
    title: 'Engineering',
    description: 'Circuits are the first live module: build a system, test it, and learn from its measurements.',
    status: 'live',
  },
  {
    id: 'mathematics',
    title: 'Mathematics',
    description:
      'Change values in a model, spot patterns, and see how one quantity affects another.',
    status: 'future',
  },
]
