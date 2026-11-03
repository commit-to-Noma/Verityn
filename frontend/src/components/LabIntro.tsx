import { Atom, ChevronLeft, ChevronRight, Eye, Lightbulb, MessagesSquare, Mic, Play } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import HealthStatus from './HealthStatus'
import LaboratoryTurntable from './LaboratoryTurntable'
import { EngineCommand, type EngineCommandKind } from './UnderTheHoodTryIts'
import { LENS_SAMPLES } from '../lens/samples'
import { friendlyErrorCode } from '../experiment/history'
import { META_EVIDENCE_BASE, SMART_DETAILS } from '../content/intelligence'
import {
  HOMEPAGE_ENTRIES,
  HOMEPAGE_HEADLINE,
  HOMEPAGE_SUBHEAD,
  LAB_LOOP,
  STEM_FIELDS,
  type STEMFieldId,
  type LaboratoryStation,
} from '../content/homepage'

const IMPACT_CASES = [
  {
    title: 'Thinking stays human',
    problem: 'AI can answer before a learner has time to think.',
    response:
      'Predict first. A coach guides; the solver checks the circuit.',
  },
  {
    title: 'Practice should not depend on a lab bench',
    problem: 'Equipment and second chances are not always available.',
    response:
      'Build, reset, and retry safely in the browser.',
  },
  {
    title: 'Diagrams should not stay static',
    problem: 'A still picture cannot show what changes in a system.',
    response:
      'Turn diagrams into models you can review and test.',
  },
  {
    title: 'A wrong answer should teach something',
    problem: 'A bare “wrong” gives little reason to keep exploring.',
    response:
      'Compare predictions with results and learn what changed.',
  },
  {
    title: 'Curiosity needs room to play',
    problem: 'Worksheets reward one right answer, so creative tinkering gets squeezed out.',
    response:
      'The Experiment Bay brings back messing about on purpose: wire anything, blow bulbs safely, then ask why.',
  },
] as const

const FIELD_ANGLES: Record<STEMFieldId, number> = {
  science: -90,
  technology: 0,
  engineering: 90,
  mathematics: 180,
}
const FIELD_ORBIT_X_RADIUS = 0.352
const FIELD_ORBIT_Y_RADIUS = 0.252

function FieldIcon({ field }: { field: STEMFieldId }) {
  return (
    <svg viewBox="0 0 100 100" className="h-[82px] w-[82px] overflow-visible drop-shadow-[0_8px_8px_rgb(0_0_0/0.55)] sm:h-[108px] sm:w-[108px]" aria-hidden="true">
      <defs>
        <linearGradient id={`field-${field}-surface`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={field === 'science' ? '#c8fbff' : field === 'technology' ? '#e5d7ff' : field === 'engineering' ? '#fff1bb' : '#c9ffe1'} />
          <stop offset="48%" stopColor={field === 'science' ? '#35c5d2' : field === 'technology' ? '#9a7be9' : field === 'engineering' ? '#e3a739' : '#44c28f'} />
          <stop offset="100%" stopColor={field === 'science' ? '#126071' : field === 'technology' ? '#443079' : field === 'engineering' ? '#79502b' : '#225d4b'} />
        </linearGradient>
        <linearGradient id={`field-${field}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f4ffff" stopOpacity=".9" />
          <stop offset="50%" stopColor="#83f5ff" stopOpacity=".42" />
          <stop offset="100%" stopColor="#14778a" stopOpacity=".88" />
        </linearGradient>
        <linearGradient id={`field-${field}-metal`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#fff4c4" />
          <stop offset="42%" stopColor="#f0bd54" />
          <stop offset="100%" stopColor="#9b5b20" />
        </linearGradient>
        {field === 'science' && (
          <clipPath id="science-flask-interior">
            <path d="M42 40V24l-5-7h26l-5 7v16l20 38c2 4 0 7-5 7H30c-5 0-7-3-5-7z" />
          </clipPath>
        )}
      </defs>
      {field === 'science' && (
        <g stroke="#d9fbff" strokeLinejoin="round">
          <path d="M39 10h22v7l-6 7v18l22 36c4 7 0 13-8 13H31c-8 0-12-6-8-13l22-36V24l-6-7z" fill={`url(#field-${field}-glass)`} strokeWidth="3" />
          <path d="M24 68h52v30H24z" fill="#31d3d9" clipPath="url(#science-flask-interior)" />
          <path d="M24 68h52" fill="none" stroke="#a9fbff" strokeWidth="2" clipPath="url(#science-flask-interior)" />
          <path d="M43 14h14M49 28v13M34 73h12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
          <circle cx="59" cy="80" r="3" fill="#d9fbff" stroke="none" />
          <circle cx="68" cy="76" r="2" fill="#d9fbff" stroke="none" />
        </g>
      )}
      {field === 'technology' && (
        <g stroke="#e9ddff" strokeLinejoin="round">
          <path d="m25 18 47-8v44l-47 9z" fill={`url(#field-${field}-surface)`} strokeWidth="3" />
          <path d="m31 23 35-6v31l-35 7z" fill="#171c3b" stroke="#eee5ff" strokeWidth="2" />
          <path d="m37 43 8-11 7 6 8-13" fill="none" stroke="#85f5ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="60" cy="25" r="2.5" fill="#fff" stroke="none" />
          <path d="m25 63 47-9 16 15-46 12z" fill="#a58be8" strokeWidth="2.5" />
          <path d="m42 81 46-12v5L43 87z" fill="#443079" strokeWidth="2.5" />
          <path d="m47 68 13-3m-8 7 13-3" fill="none" stroke="#eee5ff" strokeWidth="2" strokeLinecap="round" />
          <path d="m19 21 5-1m49-9 5-1" fill="none" stroke="#d9caff" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {field === 'engineering' && (
        <g stroke="#fff1bc" strokeLinejoin="round">
          <g fill={`url(#field-${field}-metal)`} strokeWidth="2">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
              <rect key={angle} x="43" y="8" width="14" height="26" rx="4" transform={`rotate(${angle} 50 50)`} />
            ))}
            <circle cx="50" cy="50" r="34" />
          </g>
          <circle cx="50" cy="50" r="21" fill="#a96c27" stroke="#ffdf91" strokeWidth="3" />
          <circle cx="50" cy="50" r="12" fill="#172334" stroke="#ffe8ad" strokeWidth="4" />
          <path d="M44 21c-7 2-12 7-15 14" fill="none" stroke="#fff9dc" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {field === 'mathematics' && (
        <g stroke="#d8ffeb" strokeLinejoin="round">
          <path d="m29 19 39-8 12 9v61l-39 9-12-10z" fill={`url(#field-${field}-surface)`} strokeWidth="3" />
          <path d="m68 11 12 9v61l-12-8z" fill="#27674f" strokeWidth="2" />
          <path d="m39 29 24-5v10l-24 5z" fill="#f3fff8" stroke="#abf4ce" strokeWidth="2" />
          <g fill="#eafff3" stroke="#75d9a6" strokeWidth="1.5">
            <rect x="39" y="47" width="9" height="9" rx="2" />
            <rect x="53" y="44" width="9" height="9" rx="2" />
            <rect x="39" y="63" width="9" height="9" rx="2" />
            <rect x="53" y="60" width="9" height="9" rx="2" />
          </g>
          <path d="m29 19 12 9v62" fill="none" stroke="#f3fff8" strokeWidth="2" opacity=".8" />
        </g>
      )}
    </svg>
  )
}

function STEMOrbit() {
  const [selectedId, setSelectedId] = useState<STEMFieldId>('engineering')
  const selected = STEM_FIELDS.find((field) => field.id === selectedId) ?? STEM_FIELDS[2]
  const [rotation, setRotation] = useState(0)
  const rotationRef = useRef(0)
  const rotationAnimation = useRef<number | null>(null)
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; lastAngle: number; moved: boolean; captured: boolean } | null>(null)
  const suppressClick = useRef(false)
  const animationStartedAt = useRef<number | null>(null)

  const cancelRotationAnimation = () => {
    if (rotationAnimation.current !== null) {
      cancelAnimationFrame(rotationAnimation.current)
      rotationAnimation.current = null
    }
    animationStartedAt.current = null
  }

  const animateRotationTo = (targetRotation: number) => {
    cancelRotationAnimation()
    const startRotation = rotationRef.current
    const delta = ((targetRotation - startRotation + 540) % 360) - 180
    if (Math.abs(delta) < 0.1) {
      return
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rotationRef.current = targetRotation
      setRotation(targetRotation)
      const frontField = STEM_FIELDS.reduce((front, field) => (
        Math.sin((FIELD_ANGLES[field.id] + targetRotation) * (Math.PI / 180))
          > Math.sin((FIELD_ANGLES[front.id] + targetRotation) * (Math.PI / 180))
          ? field
          : front
      ), STEM_FIELDS[0])
      setSelectedId(frontField.id)
      return
    }

    const duration = 650

    const animate = (now: number) => {
      animationStartedAt.current ??= now
      const progress = Math.min((now - animationStartedAt.current) / duration, 1)
      const eased = 1 - (1 - progress) ** 3
      const nextRotation = startRotation + delta * eased
      rotationRef.current = nextRotation
      setRotation(nextRotation)
      const frontField = STEM_FIELDS.reduce((front, field) => {
        const fieldDepth = Math.sin((FIELD_ANGLES[field.id] + nextRotation) * (Math.PI / 180))
        const frontDepth = Math.sin((FIELD_ANGLES[front.id] + nextRotation) * (Math.PI / 180))
        return fieldDepth > frontDepth ? field : front
      }, STEM_FIELDS[0])
      setSelectedId(frontField.id)
      if (progress < 1) {
        rotationAnimation.current = requestAnimationFrame(animate)
      } else {
        rotationRef.current = targetRotation
        setRotation(targetRotation)
        const frontField = STEM_FIELDS.reduce((front, field) => (
          Math.sin((FIELD_ANGLES[field.id] + targetRotation) * (Math.PI / 180))
            > Math.sin((FIELD_ANGLES[front.id] + targetRotation) * (Math.PI / 180))
            ? field
            : front
        ), STEM_FIELDS[0])
        setSelectedId(frontField.id)
        rotationAnimation.current = null
        animationStartedAt.current = null
      }
    }
    rotationAnimation.current = requestAnimationFrame(animate)
  }

  const rotateToField = (fieldId: STEMFieldId) => {
    animateRotationTo(90 - FIELD_ANGLES[fieldId])
  }

  const rotateBy = (degrees: number) => {
    animateRotationTo(rotationRef.current + degrees)
  }

  const handleOrbitKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      rotateBy(-45)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      rotateBy(45)
    }
  }

  const getOrbitAngle = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - (bounds.left + bounds.width / 2)
    const y = event.clientY - (bounds.top + bounds.height / 2)
    return Math.atan2(
      y / (bounds.height * FIELD_ORBIT_Y_RADIUS),
      x / (bounds.width * FIELD_ORBIT_X_RADIUS),
    ) * (180 / Math.PI)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || event.button !== 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const normalizedX = (event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width * FIELD_ORBIT_X_RADIUS)
    const normalizedY = (event.clientY - (bounds.top + bounds.height / 2)) / (bounds.height * FIELD_ORBIT_Y_RADIUS)
    const radius = Math.hypot(normalizedX, normalizedY)
    if (radius < 0.86 || radius > 1.14) return

    cancelRotationAnimation()
    suppressClick.current = false
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastAngle: getOrbitAngle(event),
      moved: false,
      captured: false,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return

    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return
    drag.moved = true
    if (!drag.captured) {
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.captured = true
    }
    const angle = getOrbitAngle(event)
    const delta = ((angle - drag.lastAngle + 540) % 360) - 180
    drag.lastAngle = angle

    const nextRotation = rotationRef.current + delta
    rotationRef.current = nextRotation
    setRotation(nextRotation)
    const frontField = STEM_FIELDS.reduce((front, field) => {
      const fieldDepth = Math.sin((FIELD_ANGLES[field.id] + nextRotation) * (Math.PI / 180))
      const frontDepth = Math.sin((FIELD_ANGLES[front.id] + nextRotation) * (Math.PI / 180))
      return fieldDepth > frontDepth ? field : front
    }, STEM_FIELDS[0])
    setSelectedId(frontField.id)
  }

  const finishPointerDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current
    if (drag?.pointerId !== event.pointerId) return
    suppressClick.current = drag.moved
    dragState.current = null
    if (drag.captured && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <section aria-label="Verityn STEM learning pathways" className="flex w-full flex-col gap-3">
      <p id="stem-orbit-instructions" className="sr-only">
        Drag the ring, use the rotate buttons, or focus a category and press the left or right arrow key. Select a category to bring it forward.
      </p>
      <div
        className="relative mx-auto aspect-[1.3/1] w-full max-w-[540px] touch-pan-y"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
        onKeyDown={handleOrbitKeyDown}
        aria-describedby="stem-orbit-instructions"
      >
        <div
          role="group"
          aria-label="Rotate STEM pathways"
          aria-keyshortcuts="ArrowLeft ArrowRight"
          className="absolute right-2 top-2 z-30 flex gap-2"
        >
          <button
            type="button"
            aria-label="Rotate pathways left"
            title="Rotate pathways left"
            onClick={() => rotateBy(-45)}
            className="glass-panel flex h-11 w-11 items-center justify-center rounded-full text-flow transition-colors hover:bg-flow/15 focus-visible:outline-2 focus-visible:outline-flow"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Rotate pathways right"
            title="Rotate pathways right"
            onClick={() => rotateBy(45)}
            className="glass-panel flex h-11 w-11 items-center justify-center rounded-full text-flow transition-colors hover:bg-flow/15 focus-visible:outline-2 focus-visible:outline-flow"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div
          data-testid="stem-orbiting-planets"
          className="stem-orbit-plane absolute inset-0"
        >
          <svg viewBox="0 0 500 500" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <ellipse cx="250" cy="250" rx="176" ry="126" fill="none" stroke="rgb(2 8 18 / 0.85)" strokeWidth="15" />
            <ellipse cx="250" cy="250" rx="176" ry="126" fill="none" stroke="rgb(56 214 233 / 0.18)" strokeWidth="10" />
            <ellipse cx="250" cy="250" rx="176" ry="126" fill="none" stroke="rgb(56 214 233 / 0.78)" strokeWidth="2.5" />
            <ellipse className="stem-orbit-flow" cx="250" cy="250" rx="176" ry="126" fill="none" stroke="#63e8f4" strokeWidth="4" strokeDasharray="2 20" strokeLinecap="round" />
            <ellipse className="stem-orbit-pulse" cx="250" cy="250" rx="188" ry="138" fill="none" stroke="#63e8f4" strokeWidth="1.5" />
            <ellipse cx="250" cy="250" rx="164" ry="114" fill="none" stroke="rgb(139 114 220 / 0.48)" strokeWidth="1.5" strokeDasharray="34 16 4 16" />
            <path d="M250 124V52h24m-24 324v72h-24M74 250H52v-22m396 22h22v22" fill="none" stroke="rgb(56 214 233 / 0.78)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="274" cy="52" r="4" fill="#63e8f4" />
            <circle cx="226" cy="448" r="4" fill="#63e8f4" />
            <circle cx="52" cy="228" r="4" fill="#63e8f4" />
            <circle cx="448" cy="272" r="4" fill="#63e8f4" />
          </svg>
          {STEM_FIELDS.map((field) => {
            const angle = (FIELD_ANGLES[field.id] + rotation) * Math.PI / 180
            const depth = Math.sin(angle)
            const scale = 0.72 + ((depth + 1) / 2) * 0.4 + (field.id === selectedId ? 0.18 : 0)
            return (
              <button
                key={field.id}
                type="button"
                data-stem-field={field.id}
                aria-label={`${field.title}, ${field.status === 'live' ? 'live circuits' : 'future pathway'}`}
                aria-pressed={field.id === selectedId}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false
                    return
                  }
                  rotateToField(field.id)
                }}
                className={`stem-field-button absolute flex h-28 w-28 items-center justify-center rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flow sm:h-36 sm:w-36 ${
                  field.id === selectedId ? 'stem-icon-jiggle' : ''
                }`}
                style={{
                  left: `${50 + Math.cos(angle) * FIELD_ORBIT_X_RADIUS * 100}%`,
                  top: `${50 + Math.sin(angle) * FIELD_ORBIT_Y_RADIUS * 100}%`,
                  zIndex: Math.round(10 + depth * 10),
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <span className="stem-icon-scale" style={{ transform: `scale(${scale})` }}>
                  <FieldIcon field={field.id} />
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div aria-live="polite" className="glass-panel flex min-h-[112px] flex-col justify-center gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{selected.title}</h3>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              selected.status === 'live' ? 'border-ok/60 text-ok' : 'border-glass-border text-ink-muted'
            }`}>
              {selected.status === 'live' ? 'First live module' : 'On the roadmap'}
            </span>
          </div>
          <p className="mt-1 max-w-sm text-xs text-ink-muted">{selected.description}</p>
        </div>
      </div>
    </section>
  )
}

type ConsoleTab = 'logic' | 'voice' | 'physics' | 'vision'

const CONSOLE_TABS: ReadonlyArray<{
  id: ConsoleTab
  card: string
  sub: string
  icon: typeof MessagesSquare
}> = [
  { id: 'logic', card: 'Muse Spark', sub: 'Reasoning & logic', icon: MessagesSquare },
  { id: 'voice', card: 'Muse Voice', sub: 'Audio processing', icon: Mic },
  { id: 'physics', card: 'Verityn Solver', sub: 'Mathematical truth', icon: Atom },
  { id: 'vision', card: 'SAM samples', sub: 'Saved masks only', icon: Eye },
]

const VOICE_BEHAVIORS = [
  {
    title: '5-second captures',
    behavior: 'Recording stops by itself after about 1.5 s of silence.',
    where: 'Predict, Reality Check, and Solo',
    evidence: 'frontend/src/voice/audio.test.ts',
  },
  {
    title: 'Editable transcripts',
    behavior: 'Speech becomes Why text you can fix before continuing.',
    where: 'Prediction recap',
    evidence: 'frontend/src/voice/spokenPrediction.test.ts',
  },
  {
    title: 'Honest playback',
    behavior: 'Display drops fillers; the raw transcript stays in Trace.',
    where: 'Journey and result cards',
    evidence: 'frontend/src/voice/displayTranscript.test.ts',
  },
] as const

/** Live terminal side of the console. Feeds are labeled worked examples built
 * from documented numbers — never presented as live output. */
function ConsoleLivePanel({ tab }: { tab: ConsoleTab }) {
  if (tab === 'logic') {
    return (
      <div className="rounded-xl border border-flow/30 bg-black p-3 font-mono text-[11px] leading-5 shadow-[inset_0_0_24px_rgb(56_214_233/0.06)]">
        <p className="text-xs font-semibold text-flow">muse-spark · example trace</p>
        <div className="mt-2 flex flex-col gap-1 text-ink-muted">
          <p><span className="text-flow">[check]</span> Evaluating circuit…</p>
          <p><span className="text-flow">[input]</span> Battery 24 V, bulb 10 Ω (12 V rated)</p>
          <p><span className="text-flow">[spark]</span> Surge past the 18 V blow point.</p>
          <p className="text-ink">[output] “Light 1 exploded and no longer completes the circuit: 2.4 A and 57.6 W.”</p>
        </div>
        <p className="mt-2 font-sans text-[11px] text-ink-muted">
          Illustrated from the documented Time Bomb run; drafts must still pass the leak and number guards.
        </p>
      </div>
    )
  }
  if (tab === 'voice') {
    return (
      <div className="rounded-xl border border-flow/30 bg-black p-3 font-mono text-[11px] leading-5 shadow-[inset_0_0_24px_rgb(56_214_233/0.06)]">
        <p className="text-xs font-semibold text-flow">muse-voice · example trace</p>
        <div className="mt-2 flex flex-col gap-1 text-ink-muted">
          <p><span className="text-flow">[audio]</span> 5-second buffer · speech detected █▄█▅</p>
          <p><span className="text-flow">[transcribe]</span> Converting speech to text…</p>
          <p className="text-ink">[output] “Will it light once the loose ends are connected?”</p>
        </div>
        <p className="mt-2 font-sans text-[11px] text-ink-muted">
          Illustrated transcript; display drops fillers while the raw text stays in Trace.
        </p>
      </div>
    )
  }
  if (tab === 'physics') {
    return (
      <div className="rounded-xl border border-flow/30 bg-black p-3 font-mono text-[11px] leading-5 shadow-[inset_0_0_24px_rgb(56_214_233/0.06)]">
        <p className="text-xs font-semibold text-flow">solver · worked example</p>
        <div className="mt-2 flex flex-col gap-1 text-ink">
          <p>% Ohm&apos;s Law Evaluation Node</p>
          <p>Resistance = 10.00 Ohms</p>
          <p>Voltage = 6.00 Volts</p>
          <p>Current = Voltage / Resistance → 0.60 Amps</p>
          <p>Power = Voltage × Current → 3.60 Watts</p>
          <p>Status = INTACT (safe boundaries)</p>
        </div>
        <p className="mt-2 font-sans text-[11px] text-ink-muted">
          Light a bulb, documented — every live run is measured the same way.
        </p>
      </div>
    )
  }
  const sample = LENS_SAMPLES[0]
  if (sample === undefined) {
    return null
  }
  return (
    <div className="grid items-center gap-3 rounded-xl border border-flow/30 bg-black p-3 shadow-[inset_0_0_24px_rgb(56_214_233/0.06)] sm:grid-cols-2">
      <div className="relative overflow-hidden rounded-lg">
        <img src={sample.image} alt="" aria-hidden="true" className="block h-auto w-full" />
        <svg
          viewBox={`0 0 ${sample.width} ${sample.height}`}
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        >
          {[sample.boxes.battery, sample.boxes.bulb].map((box, index) => (
            <rect
              key={index}
              x={box.left}
              y={box.top}
              width={box.right - box.left}
              height={box.bottom - box.top}
              rx={6}
              fill="none"
              stroke="var(--color-flow)"
              strokeWidth={3}
            />
          ))}
        </svg>
      </div>
      <div>
        <p className="font-mono text-xs font-semibold text-flow">sam · saved mask</p>
        <p className="mt-1 font-sans text-xs leading-5 text-ink-muted">
          {sample.title}: taps select saved boxes with SAM provenance; no live inference runs here.
        </p>
      </div>
    </div>
  )
}

function scrollToId(id: string) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
}

/** STEM hub: orbital subject map, feature turntable, method, impact, and credits. */
export default function LabIntro({
  onEnter,
  onExperiment,
  onExploreLens,
  onDemo,
  resumeAvailable = false,
  onResume,
  storageNotice,
}: {
  onEnter: () => void
  onExperiment: () => void
  onExploreLens: () => void
  onDemo: () => void
  resumeAvailable?: boolean
  onResume?: () => void
  storageNotice?: string | null
}) {
  const handleStation = (station: LaboratoryStation) => {
    if (station.action === 'lab') {
      onEnter()
    } else if (station.action === 'experiment') {
      onExperiment()
    } else if (station.action === 'lens') {
      onExploreLens()
    } else {
      scrollToId('under-the-hood')
    }
  }
  const [loopStop, setLoopStop] = useState(0)
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('logic')
  const [sandboxLit, setSandboxLit] = useState(false)

  return (
    <section aria-labelledby="intro-heading" className="intro-ambient -m-4 flex flex-col items-center gap-10 px-4 py-16 sm:-m-6 sm:py-20">
      <div className="grid w-full items-center gap-6 text-left md:grid-cols-[0.86fr_1.14fr] lg:gap-8">
        <div className="flex flex-col items-start gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-flow">
            Verityn STEM Laboratory
          </p>
          <h2 id="intro-heading" className="max-w-xl text-3xl font-semibold leading-tight sm:text-4xl">
            {HOMEPAGE_HEADLINE}
          </h2>
          <p className="max-w-md text-base text-ink-muted">{HOMEPAGE_SUBHEAD}</p>
          <div className="w-full max-w-md">
            <HealthStatus hideWhenReady />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={onEnter}
              className="bg-flow text-on-accent flex min-h-[48px] items-center rounded-[12px] px-5 text-sm font-semibold shadow-[0_0_24px_rgb(56_214_233/0.18)]"
            >
              {HOMEPAGE_ENTRIES.startLab}
            </button>
            <button
              type="button"
              onClick={onDemo}
              className="border-glass-border flex min-h-[48px] items-center gap-2 rounded-[12px] border px-5 text-sm font-semibold text-ink transition-colors hover:bg-glass/60 focus-visible:outline-2 focus-visible:outline-flow"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {HOMEPAGE_ENTRIES.demo}
            </button>
            {resumeAvailable && onResume !== undefined && (
              <button
                type="button"
                onClick={onResume}
                className="min-h-[44px] px-1 text-sm font-medium text-flow underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-flow"
              >
                Resume saved lab
              </button>
            )}
          </div>
          {resumeAvailable && (
            <p className="max-w-md text-sm text-ink-muted">
              Progress is saved in this browser. Unfinished circuits restart from their lesson setup.
            </p>
          )}
          {storageNotice && (
            <p className="max-w-md text-sm text-unsure" role="status">
              {storageNotice}
            </p>
          )}
        </div>
        <STEMOrbit />
      </div>

      <div id="laboratory-turntable" className="flex w-full scroll-mt-6 flex-col items-center gap-4">
        <div className="text-center">
          <h3 className="text-center text-base font-semibold">{HOMEPAGE_ENTRIES.laboratory}</h3>
          <p className="mt-1 text-xs text-ink-muted">Five tools. One evidence-first learning loop.</p>
        </div>
        <LaboratoryTurntable onStationAction={handleStation} />
      </div>

      <section aria-labelledby="laboratory-loop-heading" className="w-full">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-flow">The method</p>
            <h3 id="laboratory-loop-heading" className="text-xl font-semibold">A simple learning loop</h3>
          </div>
          <p className="max-w-sm text-sm text-ink-muted">Your idea leads. The lab helps you test it.</p>
        </div>
        <ol aria-label="The laboratory loop" className="relative flex flex-col gap-2 sm:flex-row sm:items-start">
          <div aria-hidden="true" className="absolute bottom-4 left-[21px] top-4 w-px bg-glass-border sm:bottom-auto sm:left-4 sm:right-4 sm:top-[21px] sm:h-px sm:w-auto" />
          <div aria-hidden="true" className="loop-signal absolute bottom-4 left-[21px] top-4 w-px sm:bottom-auto sm:left-4 sm:right-4 sm:top-[21px] sm:h-px sm:w-auto" />
          {LAB_LOOP.map((item, index) => {
            const active = loopStop === index
            return (
              <li key={item.step} className="relative flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-2 sm:text-center">
                <button
                  type="button"
                  aria-expanded={active}
                  onClick={() => setLoopStop(index)}
                  onMouseEnter={() => setLoopStop(index)}
                  onFocus={() => setLoopStop(index)}
                  className="group flex min-h-[44px] items-center gap-3 rounded-[12px] px-1 sm:flex-col sm:gap-2"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold transition ${
                      active
                        ? 'border-flow bg-flow/20 text-flow shadow-[0_0_16px_var(--color-flow)]'
                        : 'border-glass-border bg-glass text-ink-muted group-hover:border-flow/60 group-hover:text-ink'
                    }`}
                  >
                    0{index + 1}
                  </span>
                  <span className={`text-sm font-semibold ${active ? 'text-ink' : 'text-ink-muted'}`}>
                    {item.step}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        <div aria-live="polite" className="mt-3 rounded-2xl border border-flow/30 bg-flow/5 p-4">
          <p className="text-sm text-ink">
            <span className="mr-2 font-mono text-xs font-bold text-flow">0{loopStop + 1}</span>
            {LAB_LOOP[loopStop]?.doing}
          </p>
        </div>
      </section>
      <section id="under-the-hood" aria-labelledby="under-the-hood-heading" className="w-full">
        <p className="text-flow text-xs font-semibold uppercase tracking-[0.18em]">Under the hood</p>
        <h3 id="under-the-hood-heading" className="mt-1 text-xl font-semibold">Try the real building blocks</h3>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Four tools do everything on this page. The coach asks, your voice answers, the solver measures, and the
          samples show their work.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <article className="glass-panel flex flex-col gap-2 border-flow/30 p-5 sm:col-span-2 sm:flex-row sm:items-center sm:gap-5">
            <div className="sm:max-w-xs">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-flow">The coach</p>
              <h4 className="mt-1 text-lg font-semibold">Muse Spark</h4>
            </div>
            <p className="text-sm text-ink-muted">Asks the R1 question, drafts solver-grounded explanations, and proposes what Reality Lens sees. A labelled fallback stands in when the model is unreachable.</p>
          </article>
          <article className="glass-panel flex flex-col gap-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-flow">Your voice in</p>
            <h4 className="font-semibold">Muse Voice Transcribe</h4>
            <p className="text-sm text-ink-muted">Turns speech into editable Why text in Predict, Reality Check, and Solo.</p>
          </article>
          <article className="glass-panel flex flex-col gap-2 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-flow">The ground truth</p>
            <h4 className="font-semibold">Verityn Solver</h4>
            <p className="text-sm text-ink-muted">Measures each circuit locally for current, voltage, power, and validity.</p>
          </article>
          <article className="glass-panel flex flex-col gap-1 p-4 sm:col-span-2 sm:flex-row sm:items-baseline sm:gap-3">
            <h4 className="shrink-0 font-semibold">SAM: sample only</h4>
            <p className="text-sm text-ink-muted">
              Segmentation examples are tappable samples with saved provenance; no live SAM inference is used.{' '}
              <a
                className="text-flow underline underline-offset-2"
                href={`${META_EVIDENCE_BASE}docs/sam-spike-results.json`}
                target="_blank"
                rel="noreferrer"
              >
                Sample probe results
              </a>
            </p>
          </article>
        </div>
        <details className="glass-panel mt-4 p-4">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">
            Smart details
          </summary>
          <div className="mt-4 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div role="tablist" aria-label="Engines" className="flex gap-2 sm:grid sm:grid-cols-2 lg:flex lg:flex-col">
              {CONSOLE_TABS.map((tab) => {
                const Icon = tab.icon
                const selected = consoleTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setConsoleTab(tab.id)}
                    className={`flex min-h-[56px] flex-1 items-center gap-3 rounded-[10px] border p-3 text-left lg:flex-none ${
                      selected
                        ? 'border-flow/60 bg-flow/5 shadow-[0_0_16px_-4px_var(--color-flow)]'
                        : 'border-glass-border'
                    }`}
                  >
                    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-glass-border bg-black/40">
                      <Icon className="h-4 w-4 text-flow" aria-hidden="true" />
                      {selected && (
                        <span aria-hidden="true" className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-flow shadow-[0_0_8px_var(--color-flow)]" />
                      )}
                    </span>
                    <span>
                      <span className={`block text-sm font-semibold ${selected ? 'text-ink' : 'text-ink-muted'}`}>
                        {tab.card}
                      </span>
                      <span className="block text-[11px] text-ink-muted">{tab.sub}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div role="tabpanel" className="flex min-w-0 flex-col gap-3">
              <ConsoleLivePanel tab={consoleTab} />
              <EngineCommand
                engine={
                  (
                    { logic: 'spark', voice: 'voice', physics: 'solver', vision: 'lens' } satisfies Record<
                      ConsoleTab,
                      EngineCommandKind
                    >
                  )[consoleTab]
                }
              />
              <ul className="grid gap-3 sm:grid-cols-2">
                {(consoleTab === 'voice'
                  ? VOICE_BEHAVIORS
                  : SMART_DETAILS.filter((item) => item.group === consoleTab)
                ).map((item) => (
                  <li key={item.behavior} className="rounded-lg border border-glass-border p-3">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{item.behavior}</p>
                    <p className="mt-1 text-xs text-ink-muted">Where: {item.where}</p>
                    <a
                      className="mt-2 inline-block text-xs text-flow underline underline-offset-2"
                      href={`${META_EVIDENCE_BASE}${item.evidence}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Test or trace
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </section>

      <section aria-labelledby="impact-heading" className="w-full">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-flow">Why Verityn matters</p>
        <h3 id="impact-heading" className="mt-1 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">Answers are everywhere. Understanding is not.</h3>
        <div aria-hidden="true" className="mt-3 h-1 w-40 rounded-full bg-gradient-to-r from-flow via-light to-transparent" />
        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">
          Verityn is built for the moment a learner needs to think, test, and understand, not simply look up a result.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article className="glass-panel flex h-full flex-col gap-3 p-5 lg:col-span-2 lg:row-span-2">
            <p className="font-mono text-xs font-semibold text-light">01</p>
            <h4 className="text-lg font-semibold">{IMPACT_CASES[0].title}</h4>
            <p className="border-l border-flow/70 pl-3 text-sm leading-6 text-ink">
              <span className="mr-1 font-semibold text-flow">Verityn:</span>
              {IMPACT_CASES[0].response}
            </p>
            <div aria-hidden="true" className="mt-auto rounded-xl border border-glass-border bg-black/30 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-coach">Coach preview</p>
              <p className="mt-2 w-fit max-w-full rounded-lg rounded-bl-none bg-glass-strong px-3 py-2 text-xs text-ink">
                What do you expect the circuit to do?
              </p>
              <div className="mt-2 flex gap-2">
                {['Yes', 'No', 'Not sure'].map((choice) => (
                  <span key={choice} className="rounded-[8px] border border-glass-border px-2 py-1 text-[11px] text-ink-muted">
                    {choice}
                  </span>
                ))}
              </div>
            </div>
          </article>
          <article className="glass-panel flex h-full flex-col gap-3 p-5 sm:col-span-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="text-sm font-semibold"><span className="mr-2 font-mono text-xs text-light">02</span>{IMPACT_CASES[1].title}</p>
              <p className="text-sm font-semibold"><span className="mr-2 font-mono text-xs text-light">03</span>{IMPACT_CASES[2].title}</p>
            </div>
            <p className="text-sm leading-6 text-ink-muted">Retry safely in the browser, then review and test living diagrams.</p>
            <div aria-hidden="true" className="relative overflow-hidden rounded-xl border border-glass-border bg-black/50 bg-[radial-gradient(circle_at_50%_50%,rgb(51_65_85/0.5)_1px,transparent_1px)] [background-size:14px_14px] p-3">
              <svg viewBox="0 0 220 54" className="h-12 w-full text-flow">
                <rect x="8" y="14" width="22" height="26" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
                <polyline points="30,40 110,40 110,27" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
                <polyline points="30,14 110,14 110,22" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
                <circle cx="110" cy="25" r="8" fill="var(--color-glow-light)" opacity="0.9" />
                <polyline points="118,25 150,25 150,40 212,40" fill="none" stroke="currentColor" strokeWidth="2" />
                <polyline points="150,14 212,14 212,40" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span className="absolute right-2 top-2 rounded-full border border-glass-border bg-black/60 px-2 py-0.5 font-mono text-[10px]">0.6 A · Lit</span>
            </div>
          </article>
          <article className="glass-panel flex h-full flex-col gap-3 p-5">
            <p className="font-mono text-xs font-semibold text-light">04</p>
            <h4 className="text-sm font-semibold">{IMPACT_CASES[3].title}</h4>
            <p className="border-l border-flow/70 pl-3 text-sm leading-6 text-ink">
              <span className="mr-1 font-semibold text-flow">Verityn:</span>
              {IMPACT_CASES[3].response}
            </p>
            <ul aria-label="Example friendly error labels" className="mt-auto flex flex-wrap gap-1.5">
              {['SHORTED_BATTERY', 'DANGLING_TERMINAL', 'NO_PATH'].map((code) => (
                <li key={code} className="rounded-full border border-bad/50 bg-bad/10 px-2.5 py-1 text-[11px] font-medium">
                  {friendlyErrorCode(code)}
                </li>
              ))}
            </ul>
          </article>
          <article className="glass-panel flex h-full flex-col gap-3 p-5">
            <p className="font-mono text-xs font-semibold text-light">05</p>
            <h4 className="text-sm font-semibold">{IMPACT_CASES[4].title}</h4>
            <p className="border-l border-flow/70 pl-3 text-sm leading-6 text-ink">
              <span className="mr-1 font-semibold text-flow">Verityn:</span>
              {IMPACT_CASES[4].response}
            </p>
            <div className="mt-auto flex items-center gap-3">
              <button
                type="button"
                aria-pressed={sandboxLit}
                onClick={() => setSandboxLit((current) => !current)}
                className="border-glass-border min-h-[44px] rounded-[10px] border px-4 text-sm font-medium"
              >
                {sandboxLit ? 'Switch off' : 'Try the switch'}
              </button>
              <span className="flex items-center gap-2 text-sm" aria-live="polite">
                <Lightbulb
                  aria-hidden="true"
                  className={`h-6 w-6 ${sandboxLit ? 'text-light drop-shadow-[0_0_10px_var(--color-glow-light)]' : 'text-ink-muted'}`}
                />
                {sandboxLit ? 'Lit' : 'Dark'}
              </span>
            </div>
          </article>
        </div>
      </section>
    </section>
  )
}
