export const MUSE_VOICE_SAMPLE_RATE = 24_000

/** Encode captured mono float samples as the 24 kHz PCM WAV Meta expects. */
export function encodeWav(chunks: Float32Array[], sourceSampleRate: number): Blob {
  if (!Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) {
    throw new RangeError('Audio sample rate must be positive.')
  }
  const inputLength = chunks.reduce((total, chunk) => total + chunk.length, 0)
  if (inputLength === 0) {
    return new Blob([], { type: 'audio/wav' })
  }

  const input = new Float32Array(inputLength)
  let offset = 0
  for (const chunk of chunks) {
    input.set(chunk, offset)
    offset += chunk.length
  }
  const outputLength = Math.ceil((inputLength * MUSE_VOICE_SAMPLE_RATE) / sourceSampleRate)
  const output = new Int16Array(outputLength)
  for (let index = 0; index < outputLength; index += 1) {
    const position = (index * sourceSampleRate) / MUSE_VOICE_SAMPLE_RATE
    const leftIndex = Math.min(Math.floor(position), inputLength - 1)
    const rightIndex = Math.min(leftIndex + 1, inputLength - 1)
    const fraction = position - leftIndex
    const sample = input[leftIndex]! * (1 - fraction) + input[rightIndex]! * fraction
    const clipped = Math.max(-1, Math.min(1, sample))
    output[index] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff
  }

  const bytes = new ArrayBuffer(44 + output.byteLength)
  const view = new DataView(bytes)
  const writeText = (at: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(at + index, value.charCodeAt(index))
    }
  }
  writeText(0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, MUSE_VOICE_SAMPLE_RATE, true)
  view.setUint32(28, MUSE_VOICE_SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, output.byteLength, true)
  new Int16Array(bytes, 44).set(output)
  return new Blob([bytes], { type: 'audio/wav' })
}
