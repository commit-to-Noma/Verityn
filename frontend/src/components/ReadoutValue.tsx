import { formatReading } from './format'

/** ReadoutValue (§7): a mono tabular number with its unit. */
export default function ReadoutValue({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="font-mono tabular-nums">
      {formatReading(value)} {unit}
    </span>
  )
}
