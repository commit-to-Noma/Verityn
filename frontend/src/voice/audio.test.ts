import { describe, expect, it } from 'vitest'
import { encodeWav, MUSE_VOICE_SAMPLE_RATE } from './audio'

describe('encodeWav', () => {
  it('creates mono 24 kHz PCM WAV with the expected header', async () => {
    const wav = encodeWav([new Float32Array([-1, 0, 1])], MUSE_VOICE_SAMPLE_RATE)
    const bytes = await wav.arrayBuffer()
    const view = new DataView(bytes)
    expect(wav.type).toBe('audio/wav')
    expect(bytes.byteLength).toBe(50)
    expect(view.getUint32(24, true)).toBe(24_000)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getInt16(44, true)).toBe(-32768)
    expect(view.getInt16(46, true)).toBe(0)
    expect(view.getInt16(48, true)).toBe(32767)
  })

  it('resamples captured audio and rejects invalid sample rates', () => {
    const wav = encodeWav([new Float32Array([0, 0.5, 1, 0])], 48_000)
    expect(wav.size).toBe(48)
    expect(() => encodeWav([], 0)).toThrow(RangeError)
  })
})
