type HeaderMap = Record<string, string>

export function getCsrfToken(): string {
  return (
    document.cookie
      .split("; ")
      .find(cookie => cookie.startsWith("csrf_token="))
      ?.split("=")[1] ?? ""
  )
}

export function getCsrfHeaders(): HeaderMap {
  return {
    "X-CSRF-Token": getCsrfToken(),
  }
}

export function getJsonCsrfHeaders(): HeaderMap {
  return {
    "Content-Type": "application/json",
    ...getCsrfHeaders(),
  }
}

export function getBearerAuthHeaders(token: string | null | undefined): HeaderMap {
  if (!token) return {}

  return {
    Authorization: `Bearer ${token}`,
  }
}
