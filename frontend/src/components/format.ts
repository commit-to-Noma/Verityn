/** Shared readout formatting: 4 significant digits, clean zero. */
export function formatReading(value: number): string {
  const rounded = parseFloat(value.toPrecision(4))
  return rounded === 0 ? '0' : String(rounded)
}
