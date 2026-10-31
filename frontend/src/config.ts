/** Public app URL for shareable artifacts; deploy sets VITE_PUBLIC_URL. */
export function publicUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_URL?.trim()
  if (configured !== undefined && configured !== '') {
    return configured
  }
  return window.location.origin
}
