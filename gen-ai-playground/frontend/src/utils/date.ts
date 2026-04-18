type DateValue = string | number | Date | null | undefined

type DateFormatOptions = {
  fallback?: string
  locale?: string
}

function toValidDate(value: DateValue): Date | null {
  if (value === null || value === undefined) return null

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateTime(value: DateValue, options: DateFormatOptions = {}): string {
  const { fallback = "-", locale = "en-US" } = options
  const date = toValidDate(value)
  if (!date) return fallback

  return date.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDateTimeWithDot(value: DateValue, options: DateFormatOptions = {}): string {
  const { fallback = "-", locale } = options
  const date = toValidDate(value)
  if (!date) return fallback

  return (
    date.toLocaleDateString(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    "  \u00B7  " +
    date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
    })
  )
}
