import { getJsonCsrfHeaders } from "../utils/auth"
import { apiClient } from "./httpClient"

export type StreamTextHandle = {
  cancel: () => void
  done: Promise<void>
}

type StreamRequestBody = {
  messages: { role: string; content: string }[]
  deployment_name: string
  model_path?: string
  max_tokens?: number
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function streamText(
  messages: { role: string; content: string }[],
  deploymentName: string,
  modelPath: string,
  maxTokens: number,
  onToken: (token: string) => void,
  onDone?: () => void,
  onError?: (err: unknown) => void
): StreamTextHandle {
  const controller = new AbortController()
  let settled = false
  let buffer = ""

  const parseEventBlock = async (eventBlock: string) => {
    const lines = eventBlock.split("\n")
    for (const rawLine of lines) {
      const line = rawLine.trimEnd()
      if (!line.startsWith("data:")) continue

      // so that the word are not clued together, we need to add a space after data: if there isn't one
      const data = line.startsWith("data: ") ? line.slice(6) : line.slice(5)

      // Backend may think it is helpful to send error details as a JSON-encoded string; if so, parse and handle it
      if (data.startsWith("{") && data.includes("\"error\"")) {
        try {
          const parsed = JSON.parse(data) as { error?: string; status?: number; detail?: string }
          const statusPart = parsed.status ? ` (status ${parsed.status})` : ""
          const detailPart = parsed.detail ? `: ${parsed.detail}` : ""
          if (!settled) {
            settled = true
            onError?.(new Error(`${parsed.error ?? "Stream error"}${statusPart}${detailPart}`))
          }
          return
        } catch {
          // If parsing fails continue 
        }
      }

      if (data === "[DONE]") {
        if (!settled) {
          settled = true
          onDone?.()
        }
        return
      }

      if (!settled) {
        onToken(data)
        await sleep(30) // how fast tokens come
      }
    }
  }

  const parseIncomingText = async (incoming: string) => {
    if (!incoming) return
    buffer += incoming.replace(/\r\n/g, "\n")

    while (true) {
      const separatorIndex = buffer.indexOf("\n\n")
      if (separatorIndex === -1) break

      const eventBlock = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)
      await parseEventBlock(eventBlock)

      if (settled) return
    }
  }

  const done = (async () => {
    try {
      const body: StreamRequestBody = {
        messages,
        deployment_name: deploymentName,
        model_path: modelPath || undefined,
        max_tokens: maxTokens || undefined,
      }

      const authFromAxiosDefaults =
        (apiClient.defaults.headers?.common as Record<string, unknown> | undefined)?.Authorization ??
        (apiClient.defaults.headers?.common as Record<string, unknown> | undefined)?.authorization

      const headers: Record<string, string> = {
        ...getJsonCsrfHeaders(),
        Accept: "text/event-stream",
      }
      if (typeof authFromAxiosDefaults === "string" && authFromAxiosDefaults.trim()) {
        headers.Authorization = authFromAxiosDefaults
      }

      const baseUrl = (apiClient.defaults.baseURL ?? "").replace(/\/+$/, "")
      const response = await fetch(`${baseUrl}/text/stream`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`Stream request failed with status ${response.status}`)
      }

      if (!response.body) {
        throw new Error("Stream response body is missing")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { value, done: readerDone } = await reader.read()
        if (readerDone) break

        const chunk = decoder.decode(value, { stream: true })
        await parseIncomingText(chunk)
        if (settled) return
      }

      // if we exit the loop without done, close the stream
      if (!settled) {
        settled = true
        onDone?.()
      }
    } catch (err) {
      // Ignore abort as normal cancel flow
      const maybeErr = err as { name?: string; code?: string }
      if (maybeErr?.name === "AbortError" || maybeErr?.code === "ERR_CANCELED") return
      if (!settled) {
        settled = true
        onError?.(err)
      }
      throw err
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