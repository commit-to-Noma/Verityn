import { useEffect, useState } from 'react'
import ReadoutValue from './ReadoutValue'

/** Counts 0 → value on mount. Reduced-motion users see the final value. */
export default function AnimatedReadout({ value, unit }: { value: number; unit: string }) {
  const [shown, setShown] = useState(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? value : 0,
  )
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    let frame = 0
    const started = performance.now()
    const duration = 600
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      setShown(value * (1 - Math.pow(1 - progress, 3)))
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])
  return <ReadoutValue value={shown} unit={unit} />
}
