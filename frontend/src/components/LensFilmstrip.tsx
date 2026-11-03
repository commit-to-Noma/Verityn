import { ImagePlus } from 'lucide-react'
import type { LensSample } from '../lens/samples'
import { sampleLevel } from '../lens/samples'

/** Diagram filmstrip: the upload beside every sample, always mounted
 * during review so switching contexts never loses review state. */
export default function LensFilmstrip({
  samples,
  activeSampleId,
  uploadImage,
  uploadActive,
  onSelectSample,
  onSelectUpload,
}: {
  samples: LensSample[]
  activeSampleId: string | null
  /** Null when no upload exists yet; the upload slot is then hidden. */
  uploadImage: string | null
  uploadActive: boolean
  onSelectSample: (id: string) => void
  onSelectUpload: () => void
}) {
  return (
    <div aria-label="Diagram filmstrip" className="flex flex-col gap-2">
      <p className="text-ink-muted text-xs font-semibold uppercase tracking-[0.18em]">
        Diagrams
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Choose a diagram">
        {uploadImage !== null && (
          <button
            key="upload"
            type="button"
            data-filmstrip="upload"
            aria-current={uploadActive}
            onClick={onSelectUpload}
            className={`relative flex w-36 shrink-0 flex-col overflow-hidden rounded-xl border text-left ${
              uploadActive ? 'border-flow shadow-[0_0_16px_-4px_var(--color-flow)]' : 'border-glass-border'
            }`}
          >
            <img src={uploadImage} alt="" className="h-16 w-full object-cover" />
            <span className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium">
              <ImagePlus className="h-3.5 w-3.5 shrink-0 text-flow" aria-hidden="true" />
              Your diagram
            </span>
            {uploadActive && (
              <span aria-hidden="true" className="bg-flow absolute inset-x-0 top-0 h-0.5" />
            )}
          </button>
        )}
        {samples.map((sample) => {
          const active = sample.id === activeSampleId
          return (
            <button
              key={sample.id}
              type="button"
              data-filmstrip={sample.id}
              aria-current={active}
              onClick={() => onSelectSample(sample.id)}
              className={`relative flex w-36 shrink-0 flex-col overflow-hidden rounded-xl border text-left ${
                active ? 'border-flow shadow-[0_0_16px_-4px_var(--color-flow)]' : 'border-glass-border'
              }`}
            >
              <img src={sample.image} alt="" className="h-16 w-full object-cover" />
              <span className="px-2 py-1.5 text-xs font-medium">{sample.title}</span>
              <span className="absolute top-1.5 right-1.5 rounded-full border border-glass-border bg-black/60 px-1.5 py-px text-[10px] font-medium text-ink backdrop-blur-sm">
                {sampleLevel(sample.id)}
              </span>
              {active && (
                <span aria-hidden="true" className="bg-flow absolute inset-x-0 top-0 h-0.5" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
