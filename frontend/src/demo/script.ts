/** Deterministic guided-demo script: learner-safe actions only.
 *
 * The demo performs the real journey  -  the same PredictionScreen,
 * CircuitCanvas, solver, coach ladder, and finale a learner uses. This
 * module only names WHAT the demo does (which choice, which terminals,
 * which validated demonstration); the components decide HOW, through
 * their normal commit paths. Nothing here can invent a measurement,
 * call the coach in Solo, or run an action outside the closed
 * vocabulary: validateDemoScript proves that below, and the tests
 * pin it.
 */

import { COACH_ACTIONS, parseCoachAction } from '../coach/actions'
import type { Choice } from '../lessons/lesson'
import { L1 } from '../lessons/l1'
import { TRANSFER } from '../lessons/transfer'

export interface DemoPrediction {
  lessonId: string
  choice: Choice
  why: string
}

export interface DemoConnection {
  source: string
  sourceTerminal: 'a' | 'b'
  target: string
  targetTerminal: 'a' | 'b'
}

export interface DemoBuild {
  connections: DemoConnection[]
}

export interface DemoScript {
  firstPrediction: DemoPrediction
  l1Build: DemoBuild
  realityPrediction: DemoPrediction
  demonstration: { action: string; target: string }
  soloPrediction: DemoPrediction
  soloBuild: DemoBuild
}

export const DEMO_SCRIPT: DemoScript = {
  firstPrediction: {
    lessonId: 'L1',
    choice: 'no',
    why: 'The open gap breaks the loop.',
  },
  l1Build: {
    connections: [{ source: 'B1', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' }],
  },
  realityPrediction: {
    lessonId: 'L1T1',
    choice: 'yes',
    why: 'The battery is connected to the bulb.',
  },
  demonstration: {
    action: 'close_switch',
    target: 'S1',
  },
  soloPrediction: {
    lessonId: 'L1T2',
    choice: 'yes',
    why: 'The second bulb completes the parallel path.',
  },
  soloBuild: {
    connections: [{ source: 'L2', sourceTerminal: 'b', target: 'L1', targetTerminal: 'b' }],
  },
}

const VALID_CHOICES: Choice[] = ['yes', 'no', 'not_sure']

interface SeedNode {
  id: string
  kind: string
  closed?: boolean
}

interface SeedEdge {
  id: string
  source: string
  sourceTerminal: string
  target: string
  targetTerminal: string
}

function problemsForPrediction(
  name: string,
  prediction: DemoPrediction,
  lessonId: string,
): string[] {
  const problems: string[] = []
  if (prediction.lessonId !== lessonId) {
    problems.push(`${name}: lessonId ${prediction.lessonId} is not ${lessonId}`)
  }
  if (!VALID_CHOICES.includes(prediction.choice)) {
    problems.push(`${name}: choice ${String(prediction.choice)} is not a valid prediction`)
  }
  if (typeof prediction.why !== 'string' || prediction.why.trim() === '') {
    problems.push(`${name}: why must be a non-empty line of reasoning`)
  }
  return problems
}

function problemsForBuild(
  name: string,
  build: DemoBuild,
  nodes: SeedNode[],
  edges: SeedEdge[],
): string[] {
  const problems: string[] = []
  const ids = new Set(nodes.map((node) => node.id))
  const wired = new Set(
    edges.map((edge) => `${edge.source}.${edge.sourceTerminal}-${edge.target}.${edge.targetTerminal}`),
  )
  for (const connection of build.connections) {
    for (const [node, terminal] of [
      [connection.source, connection.sourceTerminal],
      [connection.target, connection.targetTerminal],
    ] as const) {
      if (!ids.has(node)) {
        problems.push(`${name}: node ${node} is not in the lesson seed`)
      }
      if (terminal !== 'a' && terminal !== 'b') {
        problems.push(`${name}: terminal ${String(terminal)} on ${node} is not a or b`)
      }
    }
    const key = `${connection.source}.${connection.sourceTerminal}-${connection.target}.${connection.targetTerminal}`
    const flipped = `${connection.target}.${connection.targetTerminal}-${connection.source}.${connection.sourceTerminal}`
    if (wired.has(key) || wired.has(flipped)) {
      problems.push(`${name}: ${key} is already wired in the seed`)
    }
  }
  return problems
}

/** Every scripted action must name real lesson content and nothing else. */
export function validateDemoScript(script: DemoScript): string[] {
  const allowedTopLevel = new Set([
    'firstPrediction',
    'l1Build',
    'realityPrediction',
    'demonstration',
    'soloPrediction',
    'soloBuild',
  ])
  const problems = Object.keys(script).filter((key) => !allowedTopLevel.has(key)).map(
    (key) => `unknown script section: ${key}`,
  )
  problems.push(...problemsForPrediction('firstPrediction', script.firstPrediction, L1.id))
  problems.push(...problemsForPrediction('realityPrediction', script.realityPrediction, L1.twist.id))
  problems.push(...problemsForPrediction('soloPrediction', script.soloPrediction, TRANSFER.id))
  problems.push(...problemsForBuild('l1Build', script.l1Build, L1.seed.nodes, L1.seed.edges))
  problems.push(
    ...problemsForBuild('soloBuild', script.soloBuild, TRANSFER.seed.nodes, TRANSFER.seed.edges),
  )
  const action = parseCoachAction(script.demonstration.action)
  if (action === null || !(COACH_ACTIONS as readonly string[]).includes(action)) {
    problems.push(`demonstration: action ${script.demonstration.action} is outside the closed vocabulary`)
  }
  const target = L1.twist.seed.nodes.find((node) => node.id === script.demonstration.target)
  if (target === undefined) {
    problems.push(`demonstration: target ${script.demonstration.target} is not in the twist seed`)
  } else if (target.kind !== 'switch') {
    problems.push(`demonstration: target ${script.demonstration.target} is not a switch`)
  }
  return problems
}
