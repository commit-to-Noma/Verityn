import { useEffect, useRef, useState } from 'react'
import { LoaderCircle, Mic, Square } from 'lucide-react'
import { ApiError, transcribeAudio } from '../api/client'
import {
  audioRms,
  encodeWav,
  VOICE_SILENCE_MS,
  VOICE_SPEECH_RMS_THRESHOLD,
} from './audio'
import { elapsedMs, recordVoiceTiming } from './voiceTimings'

type MicState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'denied'
  | 'no-speech'
  | 'unavailable'
  | 'unsupported'

const MAX_RECORDING_MS = 30_000

interface Recording {
  stream: MediaStream
  context: AudioContext
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  silentOutput: GainNode
  chunks: Float32Array[]
  timer: number
  silenceTimer: number | null
  sawSpeech: boolean
  lastSpeechAt: number | null
}

function isPermissionError(error: unknown): boolean {
  return error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
}

/** Optional Meta transcription; the resulting words remain editable text. */
export default function MicButton({
  onTranscript,
  onStatus,
  stage = 'Guided Lab',
}: {
  onTranscript: (text: string) => void
  onStatus: (message: string) => void
  stage?: string
}) {
  const [state, setState] = useState<MicState>('idle')
  const recordingRef = useRef<Recording | null>(null)

  const updateStatus = (message: string) => {
    onStatus(message)
  }

  const releaseRecording = (recording: Recording) => {
    window.clearTimeout(recording.timer)
    if (recording.silenceTimer !== null) {
      window.clearTimeout(recording.silenceTimer)
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
    const speechEndedAt = recording.lastSpeechAt ?? performance.now()
    recordingRef.current = null
    releaseRecording(recording)
    if (!recording.sawSpeech) {
      setState('no-speech')
      updateStatus('No speech was captured. Try again or type your reason.')
      return
    }

    setState('transcribing')
    updateStatus('Transcribing with Meta Muse Voice Transcribe…')
    try {
      const wav = encodeWav(recording.chunks, recording.context.sampleRate)
      const form = new FormData()
      form.append('audio', wav, 'recording.wav')
      const { transcript, source } = await transcribeAudio(form)
      const speechToTranscriptMs = elapsedMs(speechEndedAt, performance.now())
      recordVoiceTiming({ stage, speechToTranscriptMs, transcriptToCoachReplyMs: null })
      onTranscript(transcript)
      setState('idle')
      updateStatus(
        `Heard: ${transcript} · ${stage} transcript in ${speechToTranscriptMs} ms. ${
          source === 'meta-voice-transcribe'
            ? 'Transcribed by Meta Voice Transcribe. Edit it if needed.'
            : 'Transcript added by Browser speech. Edit it before continuing.'
        }`,
      )
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error
      }
      if (error.code === 'EMPTY_TRANSCRIPT') {
        setState('no-speech')
        updateStatus('No speech was recognized. Try again or type your reason.')
        return
      }
      setState('unavailable')
      updateStatus(
        error.kind === 'http' || error.code === 'UNREADABLE'
          ? `${error.message} Type your reason instead.`
          : 'Could not reach the transcription service. Type your reason instead.',
      )
    }
  }

  const stop = () => {
    const recording = recordingRef.current
    if (recording !== null) {
      void transcribe(recording)
    }
  }

  const start = async () => {
    updateStatus('')
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      setState('unsupported')
      updateStatus('Microphone capture is not supported. Type your reason instead.')
      return
    }
    let stream: MediaStream | null = null
    let context: AudioContext | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      context = new AudioContext()
      if (context.state === 'suspended') {
        await context.resume()
      }
      const source = context.createMediaStreamSource(stream)
      const processor = context.createScriptProcessor(4096, 1, 1)
      const silentOutput = context.createGain()
      silentOutput.gain.value = 0
      const chunks: Float32Array[] = []
      processor.onaudioprocess = (event) => {
        const samples = event.inputBuffer.getChannelData(0).slice()
        chunks.push(samples)
        if (audioRms(samples) >= VOICE_SPEECH_RMS_THRESHOLD) {
          recording.sawSpeech = true
          recording.lastSpeechAt = performance.now()
          if (recording.silenceTimer !== null) {
            window.clearTimeout(recording.silenceTimer)
          }
          recording.silenceTimer = window.setTimeout(stop, VOICE_SILENCE_MS)
        }
      }
      source.connect(processor)
      processor.connect(silentOutput)
      silentOutput.connect(context.destination)
      const recording: Recording = {
        stream,
        context,
        source,
        processor,
        silentOutput,
        chunks,
        sawSpeech: false,
        lastSpeechAt: null,
        silenceTimer: null,
        timer: window.setTimeout(() => stop(), MAX_RECORDING_MS),
      }
      recordingRef.current = recording
      setState('recording')
      updateStatus('Recording. Pause for 1.5 seconds to transcribe, or stop early.')
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop())
      if (context !== null && context.state !== 'closed') {
        void context.close()
      }
      setState(isPermissionError(error) ? 'denied' : 'unavailable')
      updateStatus(
        isPermissionError(error)
          ? 'Microphone access was blocked. Type your reason instead.'
          : 'Microphone could not start. Type your reason instead.',
      )
    }
  }

  useEffect(
    () => () => {
      const recording = recordingRef.current
      if (recording !== null) {
        recordingRef.current = null
        releaseRecording(recording)
      }
    },
    [],
  )

  const unsupported = state === 'unsupported'
  return (
    <>
      {state === 'recording' ? (
        <button
          type="button"
          onClick={stop}
          aria-label="Stop voice recording"
          title="Stop recording"
          className="text-bad absolute top-1/2 right-1 grid min-h-[44px] min-w-[44px] -translate-y-1/2 place-content-center place-items-center rounded-[8px] p-3"
        >
          <Square className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          disabled={unsupported || state === 'transcribing'}
          aria-label={
            state === 'transcribing'
              ? 'Transcribing with Meta Muse Voice Transcribe'
              : 'Record a reason with Meta Muse Voice Transcribe'
          }
          title={
            unsupported
              ? 'Microphone capture is not supported. Type instead.'
              : 'Record a short reason; Meta Muse Voice Transcribe turns it into editable text.'
          }
          className="text-ink-muted absolute top-1/2 right-1 grid min-h-[44px] min-w-[44px] -translate-y-1/2 place-content-center place-items-center rounded-[8px] p-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state === 'transcribing' ? (
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <Mic className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      )}
    </>
  )
}
