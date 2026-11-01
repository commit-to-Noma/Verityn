import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, Square, Volume2, VolumeX } from 'lucide-react'
import { ApiError, converseWithCoach, transcribeAudio } from '../api/client'
import {
  coachStatementHistory,
  latestCoachMessage,
  showCoachText,
  speakCoach,
  subscribeCoachStatement,
  type CoachStatement,
} from './coachVoice'
import { encodeWav } from './audio'

type ConversationState =
  | 'ready'
  | 'listening'
  | 'transcribing'
  | 'no-speech'
  | 'denied'
  | 'unavailable'

const SILENCE_MS = 1800
const MAX_TURN_MS = 20_000
const SPEECH_RMS_THRESHOLD = 0.015

interface Recording {
  stream: MediaStream
  context: AudioContext
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  silentOutput: GainNode
  chunks: Float32Array[]
  sampleRate: number
  sawVoice: boolean
}

function isPermissionError(error: unknown): boolean {
  return error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
}

/** In-flow coach transcript, optional browser playback, and tap-to-talk replies. */
export default function CoachConversation({
  enabled,
  onEnabledChange,
  replyAvailable = true,
  learnerText,
  onLearnerTextChange,
  onPrediction,
}: {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  replyAvailable?: boolean
  learnerText: string
  onLearnerTextChange: (transcript: string) => void
  onPrediction?: (transcript: string) => boolean
}) {
  const [state, setState] = useState<ConversationState>('ready')
  const [status, setStatus] = useState('')
  const [coachMessage, setCoachMessage] = useState<CoachStatement | null>(latestCoachMessage)
  const [earlier, setEarlier] = useState(() => coachStatementHistory().slice(0, -1))
  const lastCoachStatementRef = useRef(coachMessage?.text ?? '')
  const recordingRef = useRef<Recording | null>(null)
  const enabledRef = useRef(enabled)
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  const requestRef = useRef<AbortController | null>(null)
  const stopRef = useRef<(transcribe: boolean) => void>(() => undefined)
  const onPredictionRef = useRef(onPrediction)
  const lastTranscriptRef = useRef('')
  const pendingStartRef = useRef<number | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const maxTimerRef = useRef<number | null>(null)

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])
  useEffect(() => {
    onPredictionRef.current = onPrediction
  }, [onPrediction])

  useEffect(
    () =>
      subscribeCoachStatement((statement) => {
        if (pendingStartRef.current !== null) {
          window.clearTimeout(pendingStartRef.current)
          pendingStartRef.current = null
        }
        if (recordingRef.current !== null) {
          stopRef.current(false)
        }
        lastCoachStatementRef.current = statement.text
        setCoachMessage(statement)
        setEarlier(coachStatementHistory().slice(0, -1))
      }),
    [],
  )

  // Tap-to-talk: listening starts only from the Reply button. An earlier
  // auto-listen on every finished utterance looped coach speech back into
  // the microphone, so speech-finished no longer arms the mic here.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (pendingStartRef.current !== null) {
        window.clearTimeout(pendingStartRef.current)
      }
      stopRef.current(false)
      requestRef.current?.abort()
    }
  }, [])

  const release = (recording: Recording) => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    if (maxTimerRef.current !== null) {
      window.clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
    recording.processor.onaudioprocess = null
    recording.source.disconnect()
    recording.processor.disconnect()
    recording.silentOutput.disconnect()
    recording.stream.getTracks().forEach((track) => track.stop())
    if (recording.context.state !== 'closed') {
      void recording.context.close()
    }
  }

  const transcribe = async (recording: Recording) => {
    recordingRef.current = null
    release(recording)
    if (!recording.sawVoice) {
      setState('no-speech')
      setStatus('I did not hear speech. You can try speaking again.')
      return
    }

    busyRef.current = true
    setState('transcribing')
    setStatus('Transcribing your reply with Meta Muse Voice Transcribe…')
    const request = new AbortController()
    requestRef.current = request
    try {
      const wav = encodeWav(recording.chunks, recording.sampleRate)
      const form = new FormData()
      form.append('audio', wav, 'coach-reply.wav')
      let transcript: string
      try {
        ;({ transcript } = await transcribeAudio(form, request.signal))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        if (!(error instanceof ApiError)) {
          throw error
        }
        if (error.code === 'EMPTY_TRANSCRIPT') {
          setState('no-speech')
          setStatus('No words were recognized. You can try again or type instead.')
          return
        }
        setState('unavailable')
        setStatus(
          error.kind === 'http' || error.code === 'UNREADABLE'
            ? error.code === 'UNREADABLE'
              ? 'The transcription service returned an unreadable response.'
              : error.message
            : 'Could not reach the transcription service. Check that the backend is running.',
        )
        return
      }

      onLearnerTextChange(transcript)
      if (onPredictionRef.current?.(transcript) === true) {
        lastTranscriptRef.current = transcript
        setStatus('')
        return
      }
      if (transcript === lastTranscriptRef.current) {
        // The mic likely caught its own echo: say so instead of looping
        // the same turn through the coach again.
        setState('no-speech')
        setStatus('Heard the same reply twice. Type instead if the mic is echoing.')
        return
      }
      lastTranscriptRef.current = transcript
      setStatus('The coach is thinking…')
      const result = await converseWithCoach(
        transcript,
        lastCoachStatementRef.current,
        request.signal,
      )
      lastCoachStatementRef.current = result.reply
      setStatus('')
      if (enabledRef.current) {
        speakCoach(result.reply, { provider: result.provider })
      } else {
        showCoachText(result.reply, result.provider)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      } else if (error instanceof ApiError) {
        setState('unavailable')
        setStatus(error.message)
      } else if (error instanceof TypeError) {
        setState('unavailable')
        setStatus('Could not reach the transcription service. Check that the backend is running.')
      } else {
        throw error
      }
    } finally {
      if (requestRef.current === request) {
        requestRef.current = null
      }
      busyRef.current = false
      if (mountedRef.current) {
        setState((current) => current === 'transcribing' ? 'ready' : current)
      }
    }
  }

  const stop = (shouldTranscribe: boolean) => {
    const recording = recordingRef.current
    if (recording === null) {
      return
    }
    if (shouldTranscribe) {
      void transcribe(recording)
    } else {
      recordingRef.current = null
      release(recording)
      busyRef.current = false
    }
  }
  const start = async () => {
    if (busyRef.current || recordingRef.current !== null) {
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      setState('unavailable')
      setStatus('Microphone capture is unavailable in this browser.')
      return
    }
    busyRef.current = true
    if (pendingStartRef.current !== null) {
      window.clearTimeout(pendingStartRef.current)
      pendingStartRef.current = null
    }
    setStatus('Requesting microphone permission…')
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        busyRef.current = false
        return
      }
      context = new AudioContext()
      if (context.state === 'suspended') {
        await context.resume()
      }
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        await context.close()
        busyRef.current = false
        return
      }
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const silentOutput = context.createGain()
      silentOutput.gain.value = 0
      const recording: Recording = {
        stream,
        context,
        source,
        processor,
        silentOutput,
        chunks: [],
        sampleRate: context.sampleRate,
        sawVoice: false,
      }
      processor.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0).slice()
        recording.chunks.push(samples)
        let energy = 0
        for (const sample of samples) {
          energy += sample * sample
        }
        const rms = Math.sqrt(energy / samples.length)
        if (rms >= SPEECH_RMS_THRESHOLD) {
          recording.sawVoice = true
          if (silenceTimerRef.current !== null) {
            window.clearTimeout(silenceTimerRef.current)
          }
          silenceTimerRef.current = window.setTimeout(
            () => stopRef.current(true),
            SILENCE_MS,
          )
        }
      }
      source.connect(processor)
      processor.connect(silentOutput)
      silentOutput.connect(context.destination)
      recordingRef.current = recording
      maxTimerRef.current = window.setTimeout(
        () => stopRef.current(true),
        MAX_TURN_MS,
      )
      busyRef.current = false
      setState('listening')
      setStatus('Listening. Pausing will send this turn to Meta for transcription.')
    } catch (error) {
      busyRef.current = false
      stream?.getTracks().forEach((track) => track.stop())
      if (context !== null && context.state !== 'closed') {
        void context.close()
      }
      if (mountedRef.current) {
        setState(isPermissionError(error) ? 'denied' : 'unavailable')
        setStatus(
          isPermissionError(error)
            ? 'Microphone permission was denied. Allow it in your browser settings to speak with the coach.'
            : 'The microphone could not start. Check your browser and microphone settings.',
        )
      }
    }
  }
  useEffect(() => {
    stopRef.current = stop
  })

  const displayState = state
  const visibleStatus =
    state === 'denied' || state === 'unavailable' || state === 'no-speech'
      ? status
      : displayState === 'listening'
        ? 'Listening…'
        : displayState === 'transcribing'
          ? 'Thinking…'
          : status
  if (coachMessage === null && visibleStatus === '' && learnerText.trim() === '') {
    return null
  }
  return (
    <section
      aria-label="Coach dock"
      className="glass-panel flex min-w-0 flex-col gap-3 rounded-2xl p-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-flow">Coach</p>
          {coachMessage !== null && (
            <p className="mt-1 break-words text-sm leading-relaxed" aria-live="polite">
              {coachMessage.text}
              {coachMessage.provider === 'meta-spark' && (
                <span className="ml-2 inline-flex rounded-full border border-flow/40 px-2 py-0.5 align-middle text-[10px] font-medium text-flow">
                  Meta Spark
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const next = !enabled
              onEnabledChange(next)
              if (next && coachMessage !== null) {
                speakCoach(coachMessage.text, {
                  force: true,
                  provider: coachMessage.provider,
                })
              }
            }}
            aria-label={enabled ? 'Turn browser voice off' : 'Turn browser voice on'}
            aria-pressed={enabled}
            title="Browser voice, not Meta"
            className="border-glass-border text-ink-muted hover:text-ink inline-flex h-9 w-9 items-center justify-center rounded-full border"
          >
            {enabled
              ? <Volume2 className="h-4 w-4" aria-hidden="true" />
              : <VolumeX className="h-4 w-4" aria-hidden="true" />}
          </button>
          {displayState === 'listening' ? (
            <button
              type="button"
              onClick={() => stopRef.current(true)}
              aria-label="Stop listening and send reply"
              className="inline-flex min-h-9 items-center gap-2 rounded-full border border-bad/50 px-3 text-xs"
            >
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
              Stop
            </button>
          ) : displayState === 'transcribing' ? (
            <LoaderCircle className="h-5 w-5 animate-spin text-flow" aria-label="Transcribing" />
          ) : replyAvailable ? (
            <button
              type="button"
              onClick={() => void start()}
              aria-label="Reply to the coach by voice"
              className="border-glass-border inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-xs"
            >
              <Mic className="h-3.5 w-3.5" aria-hidden="true" />
              Reply by voice
            </button>
          ) : null}
        </div>
      </div>
      {visibleStatus !== '' && (
        <p className="text-ink-muted text-xs" role="status" aria-live="polite">
          {visibleStatus}
        </p>
      )}
      {learnerText !== '' && (
        <p className="break-words text-sm" aria-live="polite">
          <span className="font-semibold">You:</span> {learnerText}
        </p>
      )}
      {earlier.length > 0 && (
        <details className="border-t border-glass-border/70 pt-2">
          <summary className="text-ink-muted cursor-pointer text-xs font-medium">
            Earlier
          </summary>
          <ol className="mt-2 flex flex-col gap-2">
            {earlier.map((statement, index) => (
              <li key={`${index}-${statement.text}`} className="break-words text-xs text-ink-muted">
                {statement.text}
                {statement.provider === 'meta-spark' && (
                  <span className="ml-2 inline-flex rounded-full border border-flow/40 px-2 py-0.5 align-middle text-[10px] font-medium text-flow">
                    Meta Spark
                  </span>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}
