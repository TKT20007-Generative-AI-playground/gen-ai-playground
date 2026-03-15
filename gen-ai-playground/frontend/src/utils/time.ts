type FormatDurationOptions = {
  decimals?: number
  compactMinutes?: boolean
}

/**
 * Format a duration in milliseconds into a user-facing time string.
 */
export function formatDurationMs(ms: number, options: FormatDurationOptions = {}): string {
  const { decimals = 2, compactMinutes = false } = options

  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0
  const totalSeconds = safeMs / 1000

  if (!compactMinutes || totalSeconds < 60) {
    return `${totalSeconds.toFixed(decimals)}s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds.toFixed(decimals)}s`
}
