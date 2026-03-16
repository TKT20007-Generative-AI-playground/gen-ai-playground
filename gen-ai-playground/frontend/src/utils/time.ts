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

  let minutes = Math.floor(totalSeconds / 60)
  let roundedSeconds = Number((totalSeconds % 60).toFixed(decimals))

  // Carry overflow so we never render values like "1m 60.00s".
  if (roundedSeconds >= 60) {
    minutes += 1
    roundedSeconds = 0
  }

  return `${minutes}m ${roundedSeconds.toFixed(decimals)}s`
}
