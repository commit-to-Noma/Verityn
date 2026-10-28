/** Static guide copy in the coach's voice. This is fixed UI text that sets
 * expectations about the coach — never a model response, never a hint. */
export default function CoachNote({ children }: { children: string }) {
  return (
    <div className="coach-note flex items-center gap-3 py-1 pl-3">
      <span className="coach-dot" aria-hidden="true" />
      <p className="text-sm text-ink-muted">{children}</p>
    </div>
  )
}
