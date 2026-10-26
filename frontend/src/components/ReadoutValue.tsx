/** ReadoutValue (§7): a mono tabular number with its unit. */

function formatReading(value: number): string {
  const rounded = parseFloat(value.toPrecision(4))
  return rounded === 0 ? '0' : String(rounded)
}

export default function ReadoutValue({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="font-mono tabular-nums">
      {formatReading(value)} {unit}
    </span>
  )
}
