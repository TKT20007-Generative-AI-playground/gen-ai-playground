export const DEFAULT_BACKEND_URL = "http://localhost:8000"

const configuredBackendUrl = import.meta.env.VITE_API_URL?.trim()
const resolvedBackendUrl = configuredBackendUrl || DEFAULT_BACKEND_URL

export const backendUrl = resolvedBackendUrl.replace(/\/+$/, "")

// Base URL for a locally running Ollama instance (e.g. on the user's own Mac).
// The browser talks to this directly; it never goes through the playground backend.
export const DEFAULT_OLLAMA_URL = "http://localhost:11434"

const configuredOllamaUrl = import.meta.env.VITE_OLLAMA_URL?.trim()
const resolvedOllamaUrl = configuredOllamaUrl || DEFAULT_OLLAMA_URL

export const ollamaBaseUrl = resolvedOllamaUrl.replace(/\/+$/, "")
