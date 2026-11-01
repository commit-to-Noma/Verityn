import { formatReading } from '../components/format'

export function batterySupplyLine(voltage: number, current: number, power: number): string {
  return `Battery supplies ${formatReading(Math.abs(current))} A (${formatReading(Math.abs(power))} W) at ${formatReading(voltage)} V.`
}
