import { useState } from 'react'
import {
  LABORATORY_STATIONS,
  type LaboratoryStation,
  type StationAction,
} from '../content/homepage'
import { neighborIndex, selectIndex, stationAnnouncement } from './turntable'

/** Laboratory turntable: rotate between the five workstations.
 * No timers, no auto-rotation — every change comes from the learner.
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
          className="stage-enter glass-panel flex min-h-[220px] flex-col items-start gap-2 p-5 text-left sm:p-6"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-flow">
            Station {active + 1} of {LABORATORY_STATIONS.length}
          </p>
          <h4 className="text-xl font-semibold">{station.title}</h4>
          <p className="text-sm text-ink-muted">{station.description}</p>
          <p className="text-sm font-medium text-flow">{station.evidence}</p>
          <ul aria-label={`${station.title} details`} className="flex flex-wrap gap-2">
            {station.details.map((detail) => (
              <li
                key={detail}
                className="border-glass-border text-ink-muted rounded-full border px-2.5 py-1 text-xs"
              >
                {detail}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => onStationAction(station)}
            className="bg-flow text-on-accent mt-2 flex min-h-[44px] items-center rounded-[10px] px-6 text-sm font-semibold"
          >
            {station.actionLabel} <span aria-hidden="true">→</span>
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
