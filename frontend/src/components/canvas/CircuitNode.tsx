import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { ToggleLeft, ToggleRight } from 'lucide-react'
import type { ComponentCondition } from '../../api/client'
import { useSwitchToggle } from './switchToggle'

export type CircuitNodeData = {
  kind: 'battery' | 'bulb' | 'switch'
  label: string
  /** Continuous bulb glow 0..1 from solver power; 0 for other kinds. */
  glow: number
  invalid: boolean
  /** Battery voltage for display and conversion; 6 when absent. */
  volts?: number
  /** Bulb safety ratings for conversion; solver defaults apply when absent. */
  ratedVolts?: number
  maxSafeWatts?: number
  /** Solver-assessed bulb condition; shown only where the canvas sets it. */
  condition?: ComponentCondition
  measurement?: {
    voltage: number
    current: number
    power: number
  }
  /** Switch contact state. New switches start closed; ignored for other kinds. */
  closed: boolean
  /** Read-only display: the switch state shows as text with no toggle button. */
  readOnly?: boolean
  /** Coach demonstration spotlight; cleared on the next canvas edit. */
  demonstrated?: boolean
  /** Detected battery polarity (+/− terminals); display only. */
  polarity?: { positive: 'a' | 'b'; negative: 'a' | 'b' }
  /** Review provenance badge for vision-seeded replicas. */
  review?: 'verified' | 'needs-review' | 'learner-corrected'
}

export type CircuitNodeType = Node<CircuitNodeData, 'circuit'>

const KIND_NAME = { battery: 'Battery', bulb: 'Bulb', switch: 'Switch' } as const

function SwitchState({ closed }: { closed: boolean }) {
  return (
    <>
      {closed ? (
        <ToggleRight className="h-4 w-4 text-flow" aria-hidden="true" />
      ) : (
        <ToggleLeft className="h-4 w-4 text-flow" aria-hidden="true" />
      )}
      {closed ? 'Closed' : 'Open'}
    </>
  )
}

/** CircuitNode: clear schematic-like battery, bulb, and switch variants with terminals. */
export default function CircuitNode({ id, data }: NodeProps<CircuitNodeType>) {
  const onToggleClosed = useSwitchToggle()
  return (
    <div
      aria-label={`${KIND_NAME[data.kind]} ${data.label}`}
      className={`relative flex min-w-32 flex-col items-center ${
        data.invalid ? 'component-invalid' : ''
      } ${data.kind === 'switch' && !data.closed ? 'component-open' : ''} ${
        data.demonstrated === true ? 'component-demo' : ''
      }`}
    >
      <Handle id="a" type="source" position={Position.Left} className="terminal-handle" aria-label="Terminal a" />
      <Handle id="a" type="target" position={Position.Left} className="terminal-handle" aria-label="Terminal a input" />
      <div className="flex flex-col items-center gap-1">
        {data.kind === 'battery' ? (
          <svg className="component-illustration battery-illustration" viewBox="0 0 92 64" aria-hidden="true">
            <defs>
              <linearGradient id={`battery-body-${data.label}`} x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#0b0d14" />
                <stop offset="0.55" stopColor="#252b38" />
                <stop offset="1" stopColor="#11141d" />
              </linearGradient>
              <linearGradient id={`battery-cap-${data.label}`} x1="0" x2="1">
                <stop offset="0" stopColor="#8f4b2d" />
                <stop offset="0.55" stopColor="#d07a3d" />
                <stop offset="1" stopColor="#7e3c28" />
              </linearGradient>
            </defs>
            <path d="M2 32H10M82 32H90" className="component-lead" />
            <path d="M12 18C7 18 5 23 5 32s2 14 7 14" className="battery-negative-end" />
            <path d="M12 18H65C69 18 72 24 72 32s-3 14-7 14H12" className="battery-body" fill={`url(#battery-body-${data.label})`} />
            <path d="M64 18H73C77 18 79 24 79 32s-2 14-6 14H64" className="battery-wrap" fill={`url(#battery-cap-${data.label})`} />
            <path d="M79 24h4v16h-4" className="battery-terminal" />
            <path d="M18 32h9" className="battery-negative" />
            <path d="M57 32h10M62 27v10" className="battery-positive" />
          </svg>
        ) : data.kind === 'bulb' ? (
          <>
            {data.glow > 0 && (
              <div aria-hidden="true" className="bulb-glow" style={{ opacity: data.glow }} />
            )}
            <svg className={`component-illustration bulb-illustration ${data.glow > 0 ? 'is-lit' : ''}`} viewBox="0 0 70 54" aria-hidden="true">
            <path d="M35 5c-10 0-17 7-17 16 0 7 4 11 8 15v4h18v-4c4-4 8-8 8-15 0-9-7-16-17-16Z" />
            <path d="M27 40h16M28 45h14M31 49h8" className="bulb-base" />
            <path d="M28 20l7 7 7-7" className="bulb-filament" />
            </svg>
          </>
        ) : (
          <svg className="component-illustration switch-illustration" viewBox="0 0 70 54" aria-hidden="true">
            <path d="M2 40H14M56 40H68" className="component-lead" />
            {data.closed ? (
              <path d="M18 40H52" className="switch-blade" />
            ) : (
              <path d="M18 40L48 16" className="switch-blade" />
            )}
            <circle cx="18" cy="40" r="3" className="switch-contact" />
            <circle cx="52" cy="40" r="3" className="switch-contact" />
          </svg>
        )}
        <span className="text-xs font-semibold text-ink">
          {data.kind === 'battery'
            ? `Battery · ${data.volts ?? 6} V`
            : data.kind === 'bulb'
              ? `Bulb · ${data.label}`
              : `Switch · ${data.label}`}
        </span>
        {data.kind === 'bulb' && data.condition !== undefined && (
          <span
            role="status"
            aria-label={
              data.condition === 'damaged' ? 'Bulb damaged' : `Bulb ${data.condition}`
            }
            className={`rounded-full border px-2 py-px text-[10px] font-medium ${
              data.condition === 'damaged'
                ? 'border-bad/60 text-bad'
                : data.condition === 'overloaded'
                  ? 'border-light/60 text-light'
                  : 'border-ok/60 text-ok'
            }`}
          >
            {data.condition === 'damaged'
              ? 'Damaged'
              : data.condition === 'overloaded'
                ? 'Overloaded'
                : 'Intact'}
          </span>
        )}
        {data.kind === 'battery' && data.polarity !== undefined && (
          <span className="font-mono text-[10px] text-ink-muted" title="Detected polarity">
            +{data.polarity.positive} −{data.polarity.negative}
          </span>
        )}
        {data.review !== undefined && (
          <span
            className={`rounded-full border px-2 py-px text-[10px] font-medium ${
              data.review === 'verified'
                ? 'border-ok/60 text-ok'
                : data.review === 'learner-corrected'
                  ? 'border-flow/60 text-flow'
                  : 'border-glass-border text-ink-muted'
            }`}
          >
            {data.review === 'verified'
              ? 'Verified'
              : data.review === 'learner-corrected'
                ? 'Learner corrected'
                : 'Needs review'}
          </span>
        )}
      </div>
      {data.kind === 'switch' &&
        (data.readOnly ? (
          <span className="mt-1 flex min-h-[44px] items-center gap-2 rounded-[10px] border border-glass-border px-3 text-sm font-medium text-ink">
            <SwitchState closed={data.closed} />
          </span>
        ) : (
          <button
            type="button"
            aria-pressed={data.closed}
            aria-label={`Switch ${data.label}, ${data.closed ? 'closed' : 'open'}`}
            onClick={() => onToggleClosed(id)}
            className="nodrag mt-1 flex min-h-[44px] items-center gap-2 rounded-[10px] border border-glass-border px-3 text-sm font-medium text-ink"
          >
            <SwitchState closed={data.closed} />
          </button>
        ))}
      {data.measurement ? (
        <div className="component-readout" aria-label={`${data.label} measurement`}>
          <span>{data.measurement.voltage.toFixed(1)} V</span>
          <span>{data.measurement.current.toFixed(1)} A</span>
          <span>{data.measurement.power.toFixed(1)} W</span>
        </div>
      ) : data.kind === 'switch' ? null : (
        <span className="font-mono text-[10px] text-ink-muted">
          {data.kind === 'battery' ? data.label : '10 Ω'}
        </span>
      )}
      <Handle id="b" type="source" position={Position.Right} className="terminal-handle" aria-label="Terminal b" />
      <Handle id="b" type="target" position={Position.Right} className="terminal-handle" aria-label="Terminal b input" />
    </div>
  )
}
