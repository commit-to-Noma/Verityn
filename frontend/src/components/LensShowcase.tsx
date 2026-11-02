import { useEffect, useRef } from 'react'

/** Damped spring step for the tilt axes. Pure and tested. */
export function stepSpring(
  value: number,
  velocity: number,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
): { value: number; velocity: number } {
  if (!(dt > 0)) {
    return { value, velocity }
  }
  const accel = (target - value) * stiffness - velocity * damping
  const nextVelocity = velocity + accel * dt
  return { value: value + nextVelocity * dt, velocity: nextVelocity }
}

/** Free 360° spin with friction for the dial. Pure and tested. */
export function stepSpin(
  angle: number,
  velocity: number,
  friction: number,
  dt: number,
): { angle: number; velocity: number } {
  if (!(dt > 0)) {
    return { angle, velocity }
  }
  const next = velocity * Math.max(0, 1 - friction * dt)
  return { angle: angle + next * dt, velocity: next }
}

const TILT_MAX_DEG = 16
const SPRING_STIFFNESS = 120
const SPRING_DAMPING = 9
const SPIN_FRICTION = 2.2
const KEY_SPIN_KICK = 260

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/**
 * A lens dial for the Reality Lens header: drag it to tilt and spin it a full
 * 360°, let go and the springs wobble it home while its shadow settles. It is
 * anchored in place; only its pose moves. Keyboard: arrows spin and tilt.
 */
export default function LensShowcase() {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const lensRef = useRef<HTMLDivElement | null>(null)
  const shadowRef = useRef<HTMLDivElement | null>(null)
  const calm = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const pose = useRef({
    tiltX: 0,
    tiltY: 0,
    vTiltX: 0,
    vTiltY: 0,
    targetTiltX: 0,
    targetTiltY: 0,
    angle: 0,
    vAngle: 0,
    dragging: false,
    lastPointerAngle: 0,
    lastPointerAt: 0,
    bob: Math.random() * Math.PI * 2,
  })

  useEffect(() => {
    if (calm.current) {
      return
    }
    // Entrance: a full spin plus a settling wobble, all decayed by physics.
    pose.current.vAngle = 900
    pose.current.tiltX = 5
    pose.current.tiltY = -7
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.032, Math.max(0, (now - last) / 1000))
      last = now
      const p = pose.current
      p.bob += dt
      const tilt = stepSpring(p.tiltX, p.vTiltX, p.targetTiltX, SPRING_STIFFNESS, SPRING_DAMPING, dt)
      p.tiltX = tilt.value
      p.vTiltX = tilt.velocity
      const tilt2 = stepSpring(p.tiltY, p.vTiltY, p.targetTiltY, SPRING_STIFFNESS, SPRING_DAMPING, dt)
      p.tiltY = tilt2.value
      p.vTiltY = tilt2.velocity
      if (!p.dragging) {
        const spin = stepSpin(p.angle, p.vAngle, SPIN_FRICTION, dt)
        p.angle = spin.angle
        p.vAngle = spin.velocity
      }
      const lift = Math.sin(p.bob * 1.4) * 3
      if (lensRef.current !== null) {
        lensRef.current.style.transform =
          `perspective(700px) rotateX(${p.tiltX.toFixed(2)}deg) ` +
          `rotateY(${p.tiltY.toFixed(2)}deg) rotate(${p.angle.toFixed(2)}deg) ` +
          `translateY(${lift.toFixed(2)}px)`
      }
      if (shadowRef.current !== null) {
        const lean = Math.min(1, (Math.abs(p.tiltX) + Math.abs(p.tiltY)) / (TILT_MAX_DEG * 2))
        shadowRef.current.style.transform =
          `translate(${(-p.tiltY * 1.1).toFixed(2)}px, ${(lift * 0.5).toFixed(2)}px) ` +
          `scale(${(1 - lean * 0.12).toFixed(3)})`
        shadowRef.current.style.opacity = (0.55 - lean * 0.2).toFixed(3)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  const pointPose = (clientX: number, clientY: number) => {
    const el = wrapRef.current
    if (el === null) {
      return
    }
    const rect = el.getBoundingClientRect()
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    const radius = Math.max(1, Math.min(rect.width, rect.height) / 2)
    pose.current.targetTiltY = clamp(dx / radius, -1, 1) * TILT_MAX_DEG
    pose.current.targetTiltX = clamp(-dy / radius, -1, 1) * TILT_MAX_DEG
    const pointerAngle = Math.atan2(dy, dx)
    const now = performance.now()
    const prev = pose.current.lastPointerAngle
    let delta = pointerAngle - prev
    if (delta > Math.PI) {
      delta -= Math.PI * 2
    } else if (delta < -Math.PI) {
      delta += Math.PI * 2
    }
    const dt = Math.max(1, now - pose.current.lastPointerAt) / 1000
    const degrees = (delta * 180) / Math.PI
    pose.current.angle += degrees
    pose.current.vAngle = degrees / dt
    pose.current.lastPointerAngle = pointerAngle
    pose.current.lastPointerAt = now
  }

  const interactive = !calm.current

  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <div
        ref={wrapRef}
        role="img"
        aria-label="Playful Reality Lens dial. Drag to tilt and spin it; arrow keys work too."
        tabIndex={interactive ? 0 : undefined}
        onPointerDown={
          interactive
            ? (event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                const el = wrapRef.current
                if (el !== null) {
                  const rect = el.getBoundingClientRect()
                  pose.current.lastPointerAngle = Math.atan2(
                    event.clientY - (rect.top + rect.height / 2),
                    event.clientX - (rect.left + rect.width / 2),
                  )
                  pose.current.lastPointerAt = performance.now()
                }
                pose.current.dragging = true
                pose.current.vAngle = 0
                pointPose(event.clientX, event.clientY)
              }
            : undefined
        }
        onPointerMove={
          interactive
            ? (event) => {
                if (pose.current.dragging) {
                  pointPose(event.clientX, event.clientY)
                }
              }
            : undefined
        }
        onPointerUp={
          interactive
            ? () => {
                pose.current.dragging = false
                pose.current.targetTiltX = 0
                pose.current.targetTiltY = 0
              }
            : undefined
        }
        onPointerCancel={
          interactive
            ? () => {
                pose.current.dragging = false
                pose.current.targetTiltX = 0
                pose.current.targetTiltY = 0
              }
            : undefined
        }
        onKeyDown={
          interactive
            ? (event) => {
                if (event.key === 'ArrowLeft') {
                  pose.current.vAngle -= KEY_SPIN_KICK
                } else if (event.key === 'ArrowRight') {
                  pose.current.vAngle += KEY_SPIN_KICK
                } else if (event.key === 'ArrowUp') {
                  pose.current.vTiltX -= KEY_SPIN_KICK / 4
                } else if (event.key === 'ArrowDown') {
                  pose.current.vTiltX += KEY_SPIN_KICK / 4
                } else {
                  return
                }
                event.preventDefault()
              }
            : undefined
        }
        className="w-full max-w-70 touch-none cursor-grab rounded-2xl outline-none select-none focus-visible:ring-2 focus-visible:ring-flow active:cursor-grabbing"
      >
        <div ref={lensRef} className="will-change-transform">
          <svg viewBox="0 0 220 220" className="block w-full" aria-hidden="true">
            <rect x="102" y="148" width="16" height="54" rx="8" fill="none" stroke="#67e8f9" strokeWidth="5" />
            <circle cx="110" cy="208" r="4" fill="#67e8f9" />
            {Array.from({ length: 12 }, (_, tick) => (
              <line
                key={tick}
                x1="110"
                y1="12"
                x2="110"
                y2="21"
                stroke="#67e8f9"
                strokeWidth={tick % 3 === 0 ? 3 : 1.5}
                strokeLinecap="round"
                opacity="0.75"
                transform={`rotate(${tick * 30} 110 95)`}
              />
            ))}
            <circle cx="110" cy="95" r="68" fill="#0b1120" stroke="#67e8f9" strokeWidth="5" />
            <circle cx="110" cy="95" r="58" fill="none" stroke="#67e8f9" strokeWidth="1" opacity="0.5" />
            <ellipse cx="92" cy="72" rx="26" ry="13" fill="#ffffff" opacity="0.09" transform="rotate(-25 92 72)" />
            <line x1="60" y1="95" x2="160" y2="95" stroke="#67e8f9" strokeWidth="2" opacity="0.7" strokeLinecap="round" />
            <circle cx="70" cy="95" r="3.5" fill="#67e8f9" />
            <circle cx="150" cy="95" r="3.5" fill="#67e8f9" />
            <circle cx="110" cy="95" r="17" fill="#0b1120" stroke="#e2e8f0" strokeWidth="3" />
            <rect
              x="88"
              y="73"
              width="44"
              height="44"
              rx="5"
              fill="none"
              stroke="#67e8f9"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.9"
            />
            <circle cx="110" cy="95" r="5" fill="var(--color-glow-light)" className="lens-show-glow" />
            <text x="110" y="136" textAnchor="middle" fontSize="12" fill="#67e8f9" fontFamily="ui-monospace, monospace">
              0.6 A
            </text>
          </svg>
        </div>
        <div
          ref={shadowRef}
          aria-hidden="true"
          className="mx-auto -mt-1 h-5 w-3/5 rounded-full bg-black/60 blur-md"
          style={{ opacity: 0.55 }}
        />
      </div>
    </div>
  )
}
