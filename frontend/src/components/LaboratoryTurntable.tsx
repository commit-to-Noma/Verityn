import { useState } from 'react'
import {
  LABORATORY_STATIONS,
  type LaboratoryStation,
  type LaboratoryStationId,
  type StationAction,
} from '../content/homepage'
import { neighborIndex, selectIndex, stationAnnouncement } from './turntable'

function FeatureArtwork({ stationId }: { stationId: LaboratoryStationId }) {
  const label: Record<LaboratoryStationId, string> = {
    lab: 'A battery, switch, and bulb in a circuit',
    experiment: 'A circuit experiment with adjustable controls and measured output',
    lens: 'A circuit diagram inspected through a magnifying lens',
    coach: 'A coach conversation linked to a question',
    solver: 'A measured circuit waveform and verified result',
  }
  return (
    <div className="flex h-[76px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-glass-border bg-[radial-gradient(circle_at_50%_45%,rgb(56_214_233/0.13),transparent_65%),rgb(10_14_28/0.55)] sm:w-[112px]">
      <svg viewBox="0 0 144 72" role="img" aria-label={label[stationId]} className="h-full w-full">
        <path d="M12 60H132" stroke="rgb(255 255 255 / 0.1)" />
        {stationId === 'lab' && (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M28 42V20H55m34 0h27v22H28" stroke="var(--color-flow)" strokeWidth="2" />
            <rect x="55" y="14" width="10" height="12" rx="2" stroke="var(--color-light)" strokeWidth="2" />
            <path d="M68 14v12" stroke="var(--color-ink-muted)" strokeWidth="3" />
            <path d="m73 20 12-5m0 5h4" stroke="var(--color-ink)" strokeWidth="2" />
            <circle cx="72" cy="42" r="8" stroke="var(--color-light)" strokeWidth="2" />
            <path d="m68 40 4 4 4-4" stroke="var(--color-light)" strokeWidth="1.5" />
          </g>
        )}
        {stationId === 'experiment' && (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M28 22h50M28 36h76M28 50h60" stroke="var(--color-ink-muted)" strokeWidth="2" />
            <circle cx="55" cy="22" r="5" fill="var(--color-canvas)" stroke="var(--color-flow)" strokeWidth="2" />
            <circle cx="83" cy="36" r="5" fill="var(--color-canvas)" stroke="var(--color-light)" strokeWidth="2" />
            <circle cx="68" cy="50" r="5" fill="var(--color-canvas)" stroke="var(--color-flow)" strokeWidth="2" />
            <path d="M112 48V24h8v24zm13 0V15h8v33" stroke="var(--color-ok)" strokeWidth="2" />
          </g>
        )}
        {stationId === 'lens' && (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M26 18h18m-18 0v12m92-12h-18m18 0v12m-92 28h18m-18 0V52m92 6h-18m18 0V52" stroke="var(--color-flow)" strokeWidth="2" />
            <path d="M45 42h18m18 0h18m-54 0V29h12m24 13V29H69" stroke="var(--color-ink-muted)" strokeWidth="2" />
            <circle cx="67" cy="40" r="9" stroke="var(--color-light)" strokeWidth="2" />
            <path d="m73 47 8 8" stroke="var(--color-light)" strokeWidth="3" />
            <circle cx="101" cy="42" r="5" stroke="var(--color-ok)" strokeWidth="2" />
          </g>
        )}
        {stationId === 'coach' && (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M27 18h58a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8H55l-13 9v-9h-7a8 8 0 0 1-8-8V26a8 8 0 0 1 8-8Z" stroke="var(--color-coach)" strokeWidth="2" />
            <circle cx="48" cy="33" r="2" fill="var(--color-coach)" />
            <circle cx="61" cy="33" r="2" fill="var(--color-coach)" />
            <circle cx="74" cy="33" r="2" fill="var(--color-coach)" />
            <path d="m109 16 2.5 7.5L119 26l-7.5 2.5L109 36l-2.5-7.5L99 26l7.5-2.5Z" stroke="var(--color-light)" strokeWidth="2" />
          </g>
        )}
        {stationId === 'solver' && (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M29 52h84M38 52V20m17 32V31m17 21V15m17 37V25m17 27V18" stroke="rgb(255 255 255 / 0.12)" strokeWidth="1.5" />
            <path d="M30 43c10 0 9-16 21-16s11 16 22 16 11-19 22-19 10 12 20 12" stroke="var(--color-flow)" strokeWidth="2.5" />
            <circle cx="116" cy="36" r="8" stroke="var(--color-ok)" strokeWidth="2" />
            <path d="m112 36 3 3 5-6" stroke="var(--color-ok)" strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  )
}

/** Laboratory turntable: rotate between the five workstations.
 * No timers, no auto-rotation  -  every change comes from the learner.
 * Rotation animation is plain CSS, so the global reduced-motion rule
 * collapses it while the content and route actions stay identical. */
export default function LaboratoryTurntable({
  onStationAction,
}: {
  onStationAction: (station: LaboratoryStation) => void
}) {
  const [active, setActive] = useState(0)
  const station = LABORATORY_STATIONS[active]
  const prev = LABORATORY_STATIONS[neighborIndex(active, -1)]
  const next = LABORATORY_STATIONS[neighborIndex(active, 1)]

  const go = (index: number) => setActive(selectIndex(active, index))

  const onTabsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let target: number | null = null
    if (event.key === 'ArrowRight') {
      target = neighborIndex(active, 1)
    } else if (event.key === 'ArrowLeft') {
      target = neighborIndex(active, -1)
    } else if (event.key === 'Home') {
      target = 0
    } else if (event.key === 'End') {
      target = LABORATORY_STATIONS.length - 1
    }
    if (target !== null) {
      event.preventDefault()
      setActive(target)
      document.getElementById(`station-tab-${LABORATORY_STATIONS[target].id}`)?.focus()
    }
  }

  return (
    <section
      aria-label="Laboratory stations"
      aria-roledescription="carousel"
      className="flex w-full flex-col items-center gap-4"
    >
      <div className="grid w-full items-stretch gap-3 lg:grid-cols-[1fr_2fr_1fr]">
        <button
          type="button"
          onClick={() => go(neighborIndex(active, -1))}
          aria-label={`Previous station: ${prev.title}`}
          className="glass-panel text-ink-muted hidden min-h-[44px] flex-col items-center justify-center gap-1 p-4 opacity-70 transition-opacity hover:opacity-100 lg:flex"
        >
          <span aria-hidden="true" className="text-lg text-flow">
            ‹
          </span>
          <span className="text-sm font-medium">{prev.title}</span>
        </button>

        <div
          key={station.id}
          role="tabpanel"
          id="station-panel"
          aria-labelledby={`station-tab-${station.id}`}
          aria-label={`${station.title}: ${station.evidence}`}
          tabIndex={0}
          className="stage-enter glass-panel flex min-h-[236px] flex-col items-start justify-center gap-3 p-5 text-left sm:p-6"
        >
          <div className="flex w-full items-center gap-4">
            <FeatureArtwork stationId={station.id} />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-flow">
                {active + 1} / {LABORATORY_STATIONS.length} · Verityn tools
              </p>
              <h4 className="text-lg font-semibold leading-tight sm:text-xl">{station.title}</h4>
              <p className="text-xs leading-relaxed text-ink-muted sm:text-sm">{station.description}</p>
            </div>
          </div>
          <p className="text-xs font-semibold text-flow">{station.evidence}</p>
          <ul aria-label={`${station.title} details`} className="flex flex-wrap gap-2">
            {station.details.map((detail) => (
              <li
                key={detail}
                className="border-glass-border text-ink-muted rounded-full border px-2.5 py-1 text-[10px] sm:text-xs"
              >
                {detail}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onStationAction(station)}
            className="bg-flow text-on-accent flex min-h-[44px] items-center rounded-[10px] px-5 text-sm font-semibold"
          >
            {station.actionLabel} <span className="ml-1" aria-hidden="true">→</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => go(neighborIndex(active, 1))}
          aria-label={`Next station: ${next.title}`}
          className="glass-panel text-ink-muted hidden min-h-[44px] flex-col items-center justify-center gap-1 p-4 opacity-70 transition-opacity hover:opacity-100 lg:flex"
        >
          <span aria-hidden="true" className="text-lg text-flow">
            ›
          </span>
          <span className="text-sm font-medium">{next.title}</span>
        </button>
      </div>

      <div className="flex gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => go(neighborIndex(active, -1))}
          aria-label={`Previous station: ${prev.title}`}
          className="border-glass-border flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border px-4 text-lg"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <button
          type="button"
          onClick={() => go(neighborIndex(active, 1))}
          aria-label={`Next station: ${next.title}`}
          className="border-glass-border flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[10px] border px-4 text-lg"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div role="tablist" aria-label="Choose a station" onKeyDown={onTabsKeyDown} className="flex max-w-full flex-wrap justify-center gap-2">
        {LABORATORY_STATIONS.map((entry, index) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            id={`station-tab-${entry.id}`}
            aria-selected={index === active}
            aria-controls="station-panel"
            tabIndex={index === active ? 0 : -1}
            onClick={() => go(index)}
            className={`flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium ${
              index === active
                ? 'border-flow/70 text-ink'
                : 'border-glass-border text-ink-muted hover:text-ink'
            }`}
          >
            {entry.title}
          </button>
        ))}
      </div>

      <p aria-live="polite" className="sr-only">
        {stationAnnouncement(active)}
      </p>
    </section>
  )
}

export type { StationAction }
