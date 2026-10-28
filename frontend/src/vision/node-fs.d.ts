/** Minimal node:fs surface for fixture-reading tests (no @types/node). */
declare module 'node:fs' {
  export function readFileSync(path: unknown, encoding: string): string
}
