import { useEffect, useState } from 'react'
import { formatReading } from './format'
import { readingAtProgress, shouldAnimateReadout } from './readoutAnimation'

const READOUT_DURATION_MS = 650

/** ReadoutValue (§7): a mono tabular number with its unit. */
export default function ReadoutValue({ value, unit }: { value: number; unit: string }) {
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    const prefersReducedMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!shouldAnimateReadout(value, prefersReducedMotion)) {
      const frame = window.requestAnimationFrame(() => setDisplayValue(value))
      return () => window.cancelAnimationFrame(frame)
    }

    const startedAt = performance.now()
    let frame = 0
    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / READOUT_DURATION_MS, 1)
      setDisplayValue(readingAtProgress(value, progress))
      if (progress < 1) {
        frame = window.requestAnimationFrame(animate)
      }
    }
    frame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frame)
  }, [value])

  return (
    <span className="font-mono tabular-nums">
      {formatReading(displayValue)} {unit}
    </span>
  )
}
