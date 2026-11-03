/**
 * Experiment Bay juice: WebAudio-synthesized switch clacks, a live-circuit
 * hum, and the bulb-pop. No audio assets; every sound is generated.
 * Silent when the AudioContext is unavailable (tests, SSR, old browsers).
 */

const STORAGE_KEY = 'verityn-sound'

let enabled = true
let context: AudioContext | null = null
let humNodes: { oscillator: OscillatorNode; gain: GainNode } | null = null

function storedPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

if (typeof window !== 'undefined') {
  enabled = storedPreference()
}

export function isSoundEnabled(): boolean {
  return enabled
}

export function setSoundEnabled(next: boolean): void {
  enabled = next
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off')
  } catch {
    /* Private mode: the flag still holds for this session. */
  }
  if (!next) {
    stopHum()
  }
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') {
    return null
  }
  const Ctor = window.AudioContext
  if (typeof Ctor === 'undefined') {
    return null
  }
  try {
    context ??= new Ctor()
    if (context.state === 'suspended') {
      void context.resume()
    }
    return context
  } catch {
    return null
  }
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

/** Short mechanical clack for a switch toggle. */
export function playClack(): void {
  const ctx = audio()
  if (ctx === null) {
    return
  }
  try {
    const now = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = noiseBuffer(ctx, 0.06)
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2400
    filter.Q.value = 1.2
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.25, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
    source.connect(filter).connect(gain).connect(ctx.destination)
    source.start(now)
    source.stop(now + 0.08)
  } catch {
    /* Sound never breaks the bench. */
  }
}

/** Electric zap when the solver rejects a shorted battery. */
export function playZap(): void {
  const ctx = audio()
  if (ctx === null) {
    return
  }
  try {
    const now = ctx.currentTime
    const oscillator = ctx.createOscillator()
    oscillator.type = 'sawtooth'
    oscillator.frequency.setValueAtTime(180, now)
    oscillator.frequency.exponentialRampToValueAtTime(60, now + 0.18)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.22, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.22)
  } catch {
    /* Sound never breaks the bench. */
  }
}

/** Sharp glass pop when a bulb blows. */
export function playPop(): void {
  const ctx = audio()
  if (ctx === null) {
    return
  }
  try {
    const now = ctx.currentTime
    const source = ctx.createBufferSource()
    source.buffer = noiseBuffer(ctx, 0.25)
    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(3000, now)
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.2)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.4, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
    source.connect(filter).connect(gain).connect(ctx.destination)
    source.start(now)
    source.stop(now + 0.26)
  } catch {
    /* Sound never breaks the bench. */
  }
}

/**
 * Low live-circuit hum, pitched by net source volts. Runs until stopHum
 * (edits, new runs, mute, unmount). Only one hum at a time.
 */
export function startHum(netVolts: number): void {
  const ctx = audio()
  if (ctx === null || !Number.isFinite(netVolts) || netVolts <= 0) {
    return
  }
  stopHum()
  try {
    const oscillator = ctx.createOscillator()
    oscillator.type = 'sawtooth'
    oscillator.frequency.value = 48 + Math.min(netVolts, 48) * 1.5
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 220
    const gain = ctx.createGain()
    gain.gain.value = 0.0
    oscillator.connect(filter).connect(gain).connect(ctx.destination)
    oscillator.start()
    gain.gain.linearRampToValueAtTime(0.035, ctx.currentTime + 0.4)
    humNodes = { oscillator, gain }
  } catch {
    humNodes = null
  }
}

export function stopHum(): void {
  if (humNodes === null) {
    return
  }
  const { oscillator, gain } = humNodes
  humNodes = null
  try {
    gain.gain.cancelScheduledValues(0)
    gain.gain.setValueAtTime(gain.gain.value, oscillator.context.currentTime)
    gain.gain.linearRampToValueAtTime(0.0, oscillator.context.currentTime + 0.15)
    oscillator.stop(oscillator.context.currentTime + 0.2)
  } catch {
    try {
      oscillator.stop()
    } catch {
      /* Already stopped. */
    }
  }
}
