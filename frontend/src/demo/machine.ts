/** Pure guided-demo state machine.
 *
 * The demo is a visible product mode, separate from the `?auto=1`
 * presenter fallback: it owns the scripted beats (predictions, builds,
 * coach, demonstration, solo) while the existing auto timers keep
 * handling chapter gates. All transitions are pure and tested; App
 * wires them to the real components.
 */

export type DemoBeat =
  | 'predict'
  | 'build'
  | 'reality'
  | 'coach'
  | 'demonstrate'
  | 'solo'
  | 'finale'

export const DEMO_BEATS: ReadonlyArray<{ id: DemoBeat; label: string }> = [
  { id: 'predict', label: 'Predict' },
  { id: 'build', label: 'Build' },
  { id: 'reality', label: 'Reality Check' },
  { id: 'coach', label: 'Coach' },
  { id: 'demonstrate', label: 'Demonstrate' },
  { id: 'solo', label: 'Solo' },
  { id: 'finale', label: 'Finale' },
]

export interface DemoState {
  active: boolean
  paused: boolean
  beat: DemoBeat
  complete: boolean
  /** Bumped by skip: components finish their pending beat action at once. */
  signal: number
}

export const IDLE_DEMO: DemoState = {
  active: false,
  paused: false,
  beat: 'predict',
  complete: false,
  signal: 0,
}

export type DemoEvent =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'skip' }
  | { type: 'exit' }
  | { type: 'replay' }
  | { type: 'takeover' }
  | { type: 'advanced'; beat: DemoBeat }
  | { type: 'finish' }

function beatIndex(beat: DemoBeat): number {
  return DEMO_BEATS.findIndex((entry) => entry.id === beat)
}

export function demoTransition(state: DemoState, event: DemoEvent): DemoState {
  switch (event.type) {
    case 'start':
    case 'replay':
      return { active: true, paused: false, beat: 'predict', complete: false, signal: state.signal + 1 }
    case 'pause':
      if (!state.active || state.complete) {
        return state
      }
      return { ...state, paused: true }
    case 'resume':
      if (!state.active) {
        return state
      }
      return { ...state, paused: false }
    case 'skip':
      // Skip only hurries the current beat; the beat itself advances when
      // its real action completes, so one skip can never jump two beats.
      if (!state.active || state.complete) {
        return state
      }
      return { ...state, paused: false, signal: state.signal + 1 }
    case 'exit':
    case 'takeover':
      return { ...state, active: false, paused: false }
    case 'advanced':
      if (!state.active || state.complete) {
        return state
      }
      // Forward-only: repeated journey events (re-solves, verdict flips)
      // can never drag the beat backwards.
      if (beatIndex(event.beat) <= beatIndex(state.beat)) {
        return state
      }
      return { ...state, beat: event.beat }
    case 'finish':
      if (!state.active) {
        return state
      }
      return { ...state, beat: 'finale', paused: false, complete: true }
  }
}

export function demoBeatLabel(beat: DemoBeat): string {
  return DEMO_BEATS[beatIndex(beat)]?.label ?? beat
}

export function demoStepLabel(state: DemoState): string {
  return `Step ${beatIndex(state.beat) + 1} of ${DEMO_BEATS.length}`
}

export function demoStatusLabel(state: DemoState): string {
  if (!state.active) {
    return ''
  }
  if (state.complete) {
    return 'Demo complete'
  }
  return state.paused ? 'Demo paused' : 'Demo playing'
}
