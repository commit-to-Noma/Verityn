import { useState } from 'react'
import {
  ApiError,
  converseWithCoach,
  proposeCircuit,
  transcribeAudio,
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

export default function UnderTheHoodTryIts() {
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, TryItResult>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const run = async (
    key: string,
    action: () => Promise<TryItResult>,
  ) => {
    setBusy(key)
    setErrors((current) => ({ ...current, [key]: '' }))
    try {
      const result = await action()
      setResults((current) => ({ ...current, [key]: result }))
    } catch (error) {
      setErrors((current) => ({ ...current, [key]: errorText(error) }))
    } finally {
      setBusy(null)
    }
  }

  const sample = LENS_SAMPLES[0]

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <article className="glass-panel flex flex-col items-start gap-3 p-4">
        <h4 className="font-semibold">Fixed Spark question</h4>
        <p className="text-sm text-ink-muted">Ask the live coach a fixed question.</p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run('spark', async () => {
            const result = await converseWithCoach(
              'Why does a bulb light in a complete circuit?',
              'Under-the-hood fixed-question demonstration.',
            )
            return {
              label: result.provider,
              detail: result.reply,
              trace: result.trace,
            }
          })}
          className="min-h-11 rounded-lg border border-glass-border px-3 text-sm font-medium disabled:opacity-50"
        >
          {busy === 'spark' ? 'Asking…' : 'Try Spark'}
        </button>
        {errors.spark && <p className="text-sm text-bad" role="alert">{errors.spark}</p>}
        {results.spark && (
          <div className="grid gap-2" aria-live="polite">
            <p className="text-sm">{results.spark.detail}</p>
            <p className="text-ink-muted text-xs">Provider: {results.spark.label}</p>
            {results.spark.trace && <TraceRow event={results.spark.trace} />}
          </div>
        )}
      </article>

      <article className="glass-panel flex flex-col items-start gap-3 p-4">
        <h4 className="font-semibold">5-second voice recording</h4>
        <p className="text-sm text-ink-muted">Record five seconds, then transcribe the audio.</p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run('voice', async () => {
            const wav = await recordFiveSeconds()
            const form = new FormData()
            form.append('audio', wav, 'under-the-hood.wav')
            const result = await transcribeAudio(form)
            return {
              label: result.source,
              detail: result.transcript,
              trace: result.trace,
            }
          })}
          className="min-h-11 rounded-lg border border-glass-border px-3 text-sm font-medium disabled:opacity-50"
        >
          {busy === 'voice' ? 'Recording / transcribing…' : 'Record 5 seconds'}
        </button>
        {errors.voice && <p className="text-sm text-bad" role="alert">{errors.voice}</p>}
        {results.voice && (
          <div className="grid gap-2" aria-live="polite">
            <p className="text-sm">{results.voice.detail}</p>
            <p className="text-ink-muted text-xs">Provider: {results.voice.label}</p>
            {results.voice.trace && <TraceRow event={results.voice.trace} />}
          </div>
        )}
      </article>

      <article className="glass-panel flex flex-col items-start gap-3 p-4">
        <h4 className="font-semibold">Live Reality Lens sample</h4>
        <p className="text-sm text-ink-muted">{sample.title}: request a live proposal for the sample image.</p>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void run('lens', async () => {
            const image = await sampleAsDataUrl(sample.image)
            const result = await proposeCircuit(image)
            return {
              label: result.provider,
              detail: `Proposal status: ${result.proposal.status}; ${result.proposal.components.length} components and ${result.proposal.connections.length} connections.`,
              trace: result.trace,
            }
          })}
          className="min-h-11 rounded-lg border border-glass-border px-3 text-sm font-medium disabled:opacity-50"
        >
          {busy === 'lens' ? 'Requesting proposal…' : 'Try Reality Lens'}
        </button>
        {errors.lens && <p className="text-sm text-bad" role="alert">{errors.lens}</p>}
        {results.lens && (
          <div className="grid gap-2" aria-live="polite">
            <p className="text-sm">{results.lens.detail}</p>
            <p className="text-ink-muted text-xs">Provider: {results.lens.label}</p>
            {results.lens.trace && <TraceRow event={results.lens.trace} />}
          </div>
        )}
      </article>
    </div>
  )
}
