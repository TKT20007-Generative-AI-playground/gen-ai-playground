export const DEFAULT_BACKEND_URL = "http://localhost:8000"

const configuredBackendUrl = import.meta.env.VITE_API_URL?.trim()
const resolvedBackendUrl = configuredBackendUrl || DEFAULT_BACKEND_URL

export const backendUrl = resolvedBackendUrl.replace(/\/+$/, "")
