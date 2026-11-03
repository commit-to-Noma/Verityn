import { useState } from 'react'
import {
  ApiError,
  converseWithCoach,
  proposeCircuit,
  simulate,
  transcribeAudio,
  type Netlist,
  type TraceEvent,
} from '../api/client'
import { LENS_SAMPLES } from '../lens/samples'
import { encodeWav } from '../voice/audio'

type TryItResult = {
  label: string
  detail: string
  trace?: TraceEvent
}

async function sampleAsDataUrl(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Could not load the Reality Lens sample image.')
  }
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Could not prepare the Reality Lens sample image.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not prepare the Reality Lens sample image.'))
    reader.readAsDataURL(blob)
  })
}

async function recordFiveSeconds(): Promise<Blob> {
  if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
    throw new Error('Microphone recording is not supported in this browser.')
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  let context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let processor: ScriptProcessorNode | undefined
  let silentOutput: GainNode | undefined
  try {
    context = new AudioContext()
    if (context.state === 'suspended') {
      await context.resume()
    }
    source = context.createMediaStreamSource(stream)
    processor = context.createScriptProcessor(4096, 1, 1)
    silentOutput = context.createGain()
    silentOutput.gain.value = 0
    const chunks: Float32Array[] = []
    processor.onaudioprocess = (event) => {
      chunks.push(event.inputBuffer.getChannelData(0).slice())
    }
    source.connect(processor)
    processor.connect(silentOutput)
    silentOutput.connect(context.destination)
    await new Promise<void>((resolve) => window.setTimeout(resolve, 5_000))
    processor.onaudioprocess = null
    if (chunks.length === 0) {
      throw new Error('No audio was captured. Check the microphone and try again.')
    }
    return encodeWav(chunks, context.sampleRate)
  } finally {
    if (processor !== undefined) {
      processor.onaudioprocess = null
      processor.disconnect()
    }
    source?.disconnect()
    silentOutput?.disconnect()
    stream.getTracks().forEach((track) => track.stop())
    if (context !== undefined && context.state !== 'closed') {
      await context.close()
    }
  }
}

function errorText(error: unknown): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message
  }
  return 'The request could not be completed.'
}

function TraceRow({ event }: { event: TraceEvent }) {
  return (
    <div className="rounded-lg border border-glass-border bg-glass/40 p-3" aria-label="Trace row">
      <p className="font-mono text-xs">{event.tool}</p>
      <p className="text-ink-muted mt-1 text-xs">
        {event.input} → {event.output} · {event.ms} ms
      </p>
      {event.attempts !== undefined && event.attempts > 1 && (
        <p className="text-ink-muted text-xs">{event.attempts} attempts</p>
      )}
      <p className="text-ink-muted text-xs">
        {event.guard} · {event.decided_by}
      </p>
    </div>
  )
}

export type EngineCommandKind = 'spark' | 'voice' | 'lens' | 'solver'

const COMMANDS: Record<EngineCommandKind, { prompt: string; button: string; busy: string }> = {
  spark: {
    prompt: 'try-spark "Why does a bulb light in a complete circuit?"',
    button: 'Try Spark',
    busy: 'Asking…',
  },
  voice: {
    prompt: 'record --seconds 5 | transcribe',
    button: 'Record 5 seconds',
    busy: 'Recording / transcribing…',
  },
  lens: {
    prompt: 'propose --sample circuit-1',
    button: 'Try Reality Lens',
    busy: 'Requesting proposal…',
  },
  solver: {
    prompt: 'measure --loop 6V',
    button: 'Measure a loop',
    busy: 'Measuring…',
  },
}

const SIX_V_LOOP: Netlist = {
  components: [
    { id: 'B1', type: 'battery', volts: 6, a: 'p', b: '0' },
    { id: 'L1', type: 'bulb', a: 'p', b: '0' },
  ],
}

async function runEngine(engine: EngineCommandKind): Promise<TryItResult> {
  if (engine === 'spark') {
    const result = await converseWithCoach(
      'Why does a bulb light in a complete circuit?',
      'Under-the-hood fixed-question demonstration.',
    )
    return { label: result.provider, detail: result.reply, trace: result.trace }
  }
  if (engine === 'voice') {
    const wav = await recordFiveSeconds()
    const form = new FormData()
    form.append('audio', wav, 'under-the-hood.wav')
    const result = await transcribeAudio(form)
    return { label: result.source, detail: result.transcript, trace: result.trace }
  }
  if (engine === 'lens') {
    const sample = LENS_SAMPLES[0]
    if (sample === undefined) {
      throw new Error('No Reality Lens sample is available.')
    }
    const image = await sampleAsDataUrl(sample.image)
    const result = await proposeCircuit(image)
    return {
      label: result.provider,
      detail: `Proposal status: ${result.proposal.status}; ${result.proposal.components.length} components and ${result.proposal.connections.length} connections.`,
      trace: result.trace,
    }
  }
  const result = await simulate(SIX_V_LOOP)
  if (!result.ok) {
    throw new Error('The solver rejected the 6 V loop.')
  }
  const bulb = result.components.L1
  const condition = result.conditions?.L1 ?? 'intact'
  return {
    label: 'verityn-solver (live)',
    detail: `I = ${(bulb?.current ?? 0).toFixed(2)} A · P = ${(bulb?.power ?? 0).toFixed(2)} W · ${condition.toUpperCase()}`,
  }
}

/** One engine tab's executable line: prompt, run control, and live output.
 * Bare mode drops the outer box so the command lives inside the tab's
 * single terminal window. */
export function EngineCommand({ engine, bare = false }: { engine: EngineCommandKind; bare?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TryItResult | null>(null)
  const [error, setError] = useState('')
  const meta = COMMANDS[engine]
  return (
    <div
      className={
        bare
          ? 'font-mono text-[11px] leading-5'
          : 'rounded-xl border border-flow/30 bg-black p-3 font-mono text-[11px] leading-5 shadow-[inset_0_0_24px_rgb(56_214_233/0.06)]'
      }
    >
      <p className="break-all">
        <span className="mr-2 text-flow">$</span>
        {meta.prompt}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError('')
          void runEngine(engine).then(
            (next) => {
              setResult(next)
              setBusy(false)
            },
            (failure: unknown) => {
              setError(errorText(failure))
              setBusy(false)
            },
          )
        }}
        className="mt-2 min-h-11 rounded-lg border border-glass-border px-3 font-sans text-sm font-medium disabled:opacity-50"
      >
        {busy ? meta.busy : meta.button}
      </button>
      {error !== '' && (
        <p className="mt-2 font-sans text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      {result !== null && (
        <div className="mt-2 grid gap-1" aria-live="polite">
          <p className="break-words text-ink">{result.detail}</p>
          <p className="text-ink-muted">Provider: {result.label}</p>
          {result.trace !== undefined && <TraceRow event={result.trace} />}
        </div>
      )}
    </div>
  )
}
