import axios from "axios"

export const IMAGE_REQUEST_TIMEOUT_MS = 120_000

export function parseGenerationTimeMs(headers: Record<string, unknown>): number | null {
  const raw = headers["x-generation-time-ms"]
  const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined
  const parsed = parseInt(text ?? "0", 10)
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed
}

export function getAxiosRequestErrorMessage(
  err: unknown,
  timeoutMessage: string,
  fallbackMessage: string,
): string {
  if (axios.isAxiosError(err) && err.code === "ECONNABORTED") {
    return timeoutMessage
  }
  if (err instanceof Error) {
    return err.message
  }
  return fallbackMessage
}
