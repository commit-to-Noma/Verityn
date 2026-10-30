/** Homepage copy, shared between the component and its tests. */

export const HOMEPAGE_HEADLINE = 'Turn questions into experiments.'

export const HOMEPAGE_SUBHEAD =
  'Predict what will happen, build your idea, and let evidence change your mind.'

export const HOMEPAGE_FIRST_LAB =
  'Circuits are where Verityn begins. The same reasoning loop can grow into biology, chemistry, and engineering systems.'

export const HOMEPAGE_ENTRIES = {
  guidedLab: 'Enter the Guided Lab',
  explore: 'Explore the Laboratory',
  realityLens: 'Open Reality Lens',
  demo: 'Watch the guided demo',
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
      'Make a prediction, build the circuit, and compare your idea with measured evidence.',
    evidence: 'Predict → Build → Reality Check → Solo',
    details: ['0.6 A · 3.6 W', 'Solver-verified example'],
    actionLabel: 'Enter Guided Lab',
    action: 'lab',
  },
  {
    id: 'experiment',
    title: 'Experiment Bench',
    description:
      'Build freely, change the circuit, and test what happens without a lesson gate.',
    evidence: 'Run · Compare · Reset',
    details: ['5 starter benches', 'Session-local run history'],
    actionLabel: 'Open Experiment',
    action: 'experiment',
  },
  {
    id: 'lens',
    title: 'Reality Lens',
    description:
      'Bring a real circuit diagram into the laboratory, review the proposed model, and test it.',
    evidence: 'Image → Review → Editable circuit → Solver result',
    details: ['Upload → Review → Confirm', 'Measured after confirmation'],
    actionLabel: 'Open Reality Lens',
    action: 'lens',
  },
  {
    id: 'coach',
    title: 'Meta Muse Spark',
    description:
      'Guides questions and explanations using the evidence Verityn has already measured.',
    evidence: 'Asks · Hints · Explains',
    details: ['Bounded coach', 'Grounded in simulator evidence'],
    actionLabel: 'See how the coach works',
    action: 'scroll',
  },
  {
    id: 'solver',
    title: 'Verityn Solver',
    description:
      'Calculates current, voltage, power, validity, and component condition.',
    evidence: 'Measured, not guessed',
    details: ['Current', 'Power', 'Validity', 'Component condition'],
    actionLabel: 'Run an experiment',
    action: 'experiment',
  },
]
