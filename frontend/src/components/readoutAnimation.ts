export function readingAtProgress(value: number, progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress))
  const eased = 1 - (1 - clamped) ** 3
  return value * eased
}

export function shouldAnimateReadout(value: number, prefersReducedMotion: boolean): boolean {
  return Number.isFinite(value) && value !== 0 && !prefersReducedMotion
}
