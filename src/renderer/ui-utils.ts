/**
 * Shared renderer presentation helpers. Extracted in V1.5.6 from per-page
 * duplicates; behavior and fallback copy are unchanged.
 */
export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() !== '' ? error.message : fallback
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
