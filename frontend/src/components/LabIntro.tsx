import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import LaboratoryTurntable from './LaboratoryTurntable'
import {
  HOMEPAGE_ENTRIES,
  HOMEPAGE_HEADLINE,
  HOMEPAGE_SUBHEAD,
  STEM_FIELDS,
  type STEMFieldId,
  type LaboratoryStation,
} from '../content/homepage'

const LAB_LOOP = [
  { step: 'Make a claim', doing: 'Predict what will happen before any help unlocks.' },
  { step: 'Build or bring a model', doing: 'Wire a circuit on the canvas or confirm a Reality Lens proposal.' },
  { step: 'Test with the simulator', doing: 'Current, power, and validity are measured, not guessed.' },
  { step: 'Explain the evidence', doing: 'Answer the coach, then prove it solo with AI off.' },
] as const

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

function STEMOrbit({
  onEnterEngineering,
}: {
  onEnterEngineering: () => void
}) {
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
        {selected.status === 'live' && (
          <button
            type="button"
            onClick={onEnterEngineering}
            className="bg-flow text-on-accent min-h-[44px] shrink-0 rounded-[10px] px-4 text-sm font-semibold"
          >
            {HOMEPAGE_ENTRIES.startLab} <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </section>
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
      scrollToId('laboratory-loop-heading')
    }
  }

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
          <div className="flex flex-wrap gap-3">
            {resumeAvailable && onResume !== undefined && (
              <button
                type="button"
                onClick={onResume}
                className="border-glass-border flex min-h-[48px] items-center rounded-[12px] border px-5 text-sm font-semibold text-ink transition-colors hover:bg-glass/60 focus-visible:outline-2 focus-visible:outline-flow"
              >
                Resume saved lab
              </button>
            )}
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
            <button
              type="button"
              onClick={() => scrollToId('laboratory-turntable')}
              className="flex min-h-[48px] items-center rounded-[12px] border border-flow/40 px-5 text-sm font-semibold text-flow transition-colors hover:bg-flow/10 focus-visible:outline-2 focus-visible:outline-flow"
            >
              {HOMEPAGE_ENTRIES.tools}
            </button>
          </div>
          {resumeAvailable && (
            <p className="max-w-md text-sm text-ink-muted">
              Progress is saved only in this browser. Resume the last step, or start a fresh run; unfinished circuits restart from their lesson setup.
            </p>
          )}
          <p className="max-w-md text-sm text-ink-muted">
            The walkthrough runs through a sample journey automatically. Start your own lab to make predictions and build each circuit yourself.
          </p>
          {storageNotice && (
            <p className="max-w-md text-sm text-unsure" role="status">
              {storageNotice}
            </p>
          )}
        </div>
        <STEMOrbit onEnterEngineering={onEnter} />
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
        <ol aria-label="The laboratory loop" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LAB_LOOP.map((item, index) => (
            <li key={item.step} className="flex flex-col gap-2 rounded-2xl border border-glass-border bg-glass/45 p-4">
              <span className="font-mono text-xs font-semibold text-flow">0{index + 1}</span>
              <h4 className="text-sm font-semibold">{item.step}</h4>
              <p className="text-xs leading-5 text-ink-muted">{item.doing}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="impact-heading" className="grid w-full overflow-hidden rounded-[20px] border border-flow/25 bg-[radial-gradient(circle_at_10%_0%,rgb(56_214_233/0.2),transparent_42%),linear-gradient(135deg,rgb(14_38_60/0.9),rgb(10_14_28/0.55))] lg:grid-cols-[0.78fr_1.22fr]">
        <div className="flex flex-col justify-between gap-6 border-b border-flow/20 p-6 lg:border-b-0 lg:border-r lg:p-8">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-flow">Why Verityn matters</p>
            <h3 id="impact-heading" className="max-w-md text-2xl font-semibold leading-tight">Answers are everywhere. Understanding is not.</h3>
            <p className="max-w-md text-sm leading-6 text-ink-muted">
              Verityn is built for the moment a learner needs to think, test, and understand, not simply look up a result.
            </p>
          </div>
          <p className="max-w-md border-l-2 border-light pl-3 text-sm leading-6 text-ink">
            It makes science more reachable, keeps AI accountable to evidence, and turns mistakes into something learners can use.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-glass-border">
          {[IMPACT_CASES.slice(0, 2), IMPACT_CASES.slice(2)].map((column, columnIndex) => (
            <ol
              key={columnIndex}
              className={
                columnIndex === 1
                  ? 'divide-y divide-glass-border border-t border-glass-border sm:border-t-0'
                  : 'divide-y divide-glass-border'
              }
            >
              {column.map((item, index) => {
                const number = columnIndex * 2 + index + 1
                return (
                  <li key={item.title} className="flex min-h-48 flex-col gap-3 p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold text-light">0{number}</span>
                      <p className="text-sm font-semibold">{item.title}</p>
                    </div>
                    <p className="text-sm leading-6 text-ink-muted">{item.problem}</p>
                    <p className="border-l border-flow/70 pl-3 text-sm leading-6 text-ink">
                      <span className="mr-1 font-semibold text-flow">Verityn:</span>
                      {item.response}
                    </p>
                  </li>
                )
              })}
            </ol>
          ))}
        </div>
      </section>
    </section>
  )
}
