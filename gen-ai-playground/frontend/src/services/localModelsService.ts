import { ollamaBaseUrl } from "../utils/env"

/**
 * Talks DIRECTLY to a locally running Ollama instance (e.g. on the user's own Mac).
 *
 * These requests never go through the playground backend / apiClient: the target is
 * the user's own machine (http://localhost:11434 by default), which the remote backend
 * cannot reach. That is also why there is no CSRF/auth here.
 *
 * Ollama exposes:
 *  - GET  /api/tags               -> installed models
 *  - POST /api/pull               -> download a model (streamed progress)
 *  - POST /v1/chat/completions    -> OpenAI-compatible chat (same shape the rest of the app uses)
 */

/** Raised when Ollama is unreachable — either not running or blocking the browser via CORS. */
export class OllamaUnreachableError extends Error {
  constructor(message = "Ollama is not reachable. Is it running and is CORS enabled?") {
    super(message)
    this.name = "OllamaUnreachableError"
  }
}

export type LocalModel = {
  /** Full tag, e.g. "llama3.2:3b" — used as the model id for chat. */
  name: string
  /** Size on disk in bytes. */
  size?: number
  /** e.g. "3.2B" (from Ollama details). */
  parameterSize?: string
  /** e.g. "Q4_K_M". */
  quantization?: string
}

export type ChatRole = "system" | "user" | "assistant"
export type ChatMessage = { role: ChatRole; content: string }

export type ChatOptions = {
  temperature?: number
  maxTokens?: number
}

export type PullProgress = {
  status: string
  /** 0..1 when total/completed are known. */
  fraction?: number
}

export type ChatStreamHandle = {
  cancel: () => void
  done: Promise<void>
}

type OllamaTagsResponse = {
  models?: Array<{
    name: string
    size?: number
    details?: {
      parameter_size?: string
      quantization_level?: string
    }
  }>
}

const url = (path: string) => `${ollamaBaseUrl}${path}`

function toUnreachable(err: unknown): never {
  // A TypeError from fetch() means the request never completed: connection refused
  // (Ollama down) or blocked by CORS (OLLAMA_ORIGINS not set). Both map to the
  // same user-facing onboarding flow.
  if (err instanceof TypeError) {
    throw new OllamaUnreachableError()
  }
  throw err
}

/**
 * Returns true if a local Ollama server answers. Never throws.
 * Times out after `timeoutMs` so a reachable-but-silent host (e.g. a firewalled
 * remote IP) doesn't hang the "checking" state forever.
 */
export async function pingOllama(signal?: AbortSignal, timeoutMs = 4000): Promise<boolean> {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), timeoutMs)
  const onAbort = () => timeout.abort()
  signal?.addEventListener("abort", onAbort)
  try {
    const res = await fetch(url("/api/tags"), { method: "GET", signal: timeout.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
}

/** List models already installed in the local Ollama. */
export async function listLocalModels(signal?: AbortSignal): Promise<LocalModel[]> {
  let res: Response
  try {
    res = await fetch(url("/api/tags"), { method: "GET", signal })
  } catch (err) {
    toUnreachable(err)
  }
  if (!res.ok) {
    throw new Error(`Failed to list local models (status ${res.status})`)
  }
  const data = (await res.json()) as OllamaTagsResponse
  return (data.models ?? []).map(m => ({
    name: m.name,
    size: m.size,
    parameterSize: m.details?.parameter_size,
    quantization: m.details?.quantization_level,
  }))
}

/**
 * Stream a chat completion from the local model using the OpenAI-compatible endpoint.
 * Mirrors the SSE handling style of services/streamService.ts, but for the standard
 * OpenAI `choices[].delta.content` frames that Ollama emits.
 */
export function chatLocalStream(
  model: string,
  messages: ChatMessage[],
  options: ChatOptions,
  onToken: (token: string) => void,
  onDone?: () => void,
  onError?: (err: unknown) => void,
): ChatStreamHandle {
  const controller = new AbortController()
  let settled = false
  let buffer = ""

  const handleData = (data: string) => {
    if (data === "[DONE]") {
      if (!settled) {
        settled = true
        onDone?.()
      }
      return
    }
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
      }
      const token = parsed.choices?.[0]?.delta?.content
      if (typeof token === "string" && token) {
        onToken(token)
      }
    } catch {
      // Ignore keep-alive/comment frames that aren't valid JSON.
    }
  }

  const processBuffer = () => {
    while (true) {
      const sepIndex = buffer.indexOf("\n\n")
      if (sepIndex === -1) break
      const eventBlock = buffer.slice(0, sepIndex)
      buffer = buffer.slice(sepIndex + 2)
      for (const rawLine of eventBlock.split("\n")) {
        const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine
        if (!line.startsWith("data:")) continue
        handleData(line.startsWith("data: ") ? line.slice(6) : line.slice(5))
        if (settled) return
      }
    }
  }

  const done = (async () => {
    let res: Response
    try {
      res = await fetch(url("/v1/chat/completions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
        }),
        signal: controller.signal,
      })
    } catch (err) {
      const maybeErr = err as { name?: string }
      if (maybeErr?.name === "AbortError") return
      if (!settled) {
        settled = true
        onError?.(err instanceof TypeError ? new OllamaUnreachableError() : err)
      }
      return
    }

    if (!res.ok || !res.body) {
      if (!settled) {
        settled = true
        onError?.(new Error(`Local chat request failed (status ${res.status})`))
      }
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        const { value, done: readerDone } = await reader.read()
        if (readerDone) break
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n")
        processBuffer()
        if (settled) return
      }
      if (!settled) {
        settled = true
        onDone?.()
      }
    } catch (err) {
      const maybeErr = err as { name?: string }
      if (maybeErr?.name === "AbortError") return
      if (!settled) {
        settled = true
        onError?.(err)
      }
    }
  })()

  return {
    cancel: () => {
      if (!settled) {
        settled = true
        controller.abort()
      }
    },
    done,
  }
}

/**
 * Download a model into the local Ollama, reporting streamed progress.
 * Used by the "start model from the app" flow (Milestone 2).
 */
export async function pullModel(
  name: string,
  onProgress?: (progress: PullProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(url("/api/pull"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, stream: true }),
      signal,
    })
  } catch (err) {
    toUnreachable(err)
  }
  if (!res.ok || !res.body) {
    throw new Error(`Failed to pull model "${name}" (status ${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const emit = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let parsed: {
      status?: string
      total?: number
      completed?: number
      error?: string
    }
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // Non-JSON keep-alive / truncated partial line — ignore.
      return
    }
    // Only a genuine Ollama error object aborts the pull; parse failures don't.
    if (parsed.error) throw new Error(parsed.error)
    const fraction =
      parsed.total != null && parsed.completed != null && parsed.total > 0
        ? parsed.completed / parsed.total
        : undefined
    onProgress?.({ status: parsed.status ?? "downloading", fraction })
  }

  // Ollama's /api/pull streams newline-delimited JSON objects (not SSE).
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      emit(line)
    }
  }
  if (buffer) emit(buffer)
}

/** Send a tiny request so the model is loaded into memory ("warm"). */
export async function warmupModel(model: string, signal?: AbortSignal): Promise<void> {
  try {
    await fetch(url("/v1/chat/completions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
      signal,
    })
  } catch (err) {
    toUnreachable(err)
  }
}
