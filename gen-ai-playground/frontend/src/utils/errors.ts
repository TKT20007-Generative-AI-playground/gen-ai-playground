import axios from "axios"

export function getAxiosDetailMessage(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null

  const detail = err.response?.data?.detail
  return typeof detail === "string" ? detail : null
}

export function isAxiosUnauthorized(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 401
}

export function getRequestErrorMessage(err: unknown, fallbackMessage: string): string {
  return getAxiosDetailMessage(err) ?? (err instanceof Error ? err.message : fallbackMessage)
}
