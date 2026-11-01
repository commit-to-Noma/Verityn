export function finaleRevealDelay(index: number): string {
  return `${Math.max(0, index) * 260}ms`
}
