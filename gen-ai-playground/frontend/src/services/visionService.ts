import { getCsrfHeaders, getJsonCsrfHeaders } from "../utils/auth"
import { apiClient } from "./httpClient"

export type VisionChatMessagePayload = {
  role: "system" | "user" | "assistant"
  content: Array<{ type: string; text?: string; image_url?: { url: string } }>
}

export interface StreamVisionRequest {
  deployment_name: string
  model_path?: string
  messages: VisionChatMessagePayload[]
  max_tokens?: number
  temperature?: number
  top_p?: number
}

export type VisionModelApiItem = {
  value: string
  label: string
}

export type VisionModelStatuses = Record<string, "live" | "starting" | "offline" | "unknown">

export async function fetchVisionModels(): Promise<VisionModelApiItem[]> {
  const res = await apiClient.get<{ available_models?: VisionModelApiItem[] }>("/vision/models", {
    headers: getCsrfHeaders(),
  })
  return res.data.available_models ?? []
}

export async function fetchVisionModelStatuses(): Promise<VisionModelStatuses> {
  const res = await apiClient.get<VisionModelStatuses>("/vision/model-statuses", {
    headers: getCsrfHeaders(),
  })
  return res.data
}

export async function streamVision(request: StreamVisionRequest, ref: { current: boolean }): Promise<AsyncIterableIterator<string>> {
  const authFromAxiosDefaults =
    (apiClient.defaults.headers?.common as Record<string, unknown> | undefined)?.Authorization ??
    (apiClient.defaults.headers?.common as Record<string, unknown> | undefined)?.authorization

  const headers: Record<string, string> = {
    ...getJsonCsrfHeaders(),
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  }
  if (typeof authFromAxiosDefaults === "string" && authFromAxiosDefaults.trim()) {
    headers.Authorization = authFromAxiosDefaults
  }

  const baseUrl = (apiClient.defaults.baseURL ?? "").replace(/\/+$/, "")
  const response = await fetch(`${baseUrl}/vision/stream`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stream error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  console.log("[VisionService] Stream response received, status:", response.status);

  async function* generate(): AsyncIterableIterator<string> {
    let rawLineCount = 0;
    while (ref.current) {
      const { done, value } = await reader.read();
      if (done) {
        console.log(`[VisionService] Reader done, total raw lines: ${rawLineCount}`);
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line) continue;
        rawLineCount++;
        if (rawLineCount <= 5) {
          console.log(`[VisionService] raw line[${rawLineCount}]:`, line.substring(0, 150));
        }
        if (!line.startsWith("data: ")) continue;
        if (line === "data: [DONE]") {
          console.log("[VisionService] Got [DONE] signal");
          reader.cancel();
          return;
        }

        const dataStr = line.replace("data: ", "").trim();
        if (!dataStr) continue;

        try {
          const data = JSON.parse(dataStr);
          if (data.error) {
            console.error("[VisionService] Stream error from server:", data.error);
            throw new Error(data.error);
          }
          if (data.choices && data.choices.length > 0) {
            const delta = data.choices[0]?.delta || {};
            const content = delta.content || "";
            const reasoning = delta.reasoning_content || "";
            if (reasoning || content) {
              yield reasoning + content;
            }
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            // JSON parse failed — incomplete line or malformed chunk, skip
            console.warn("[VisionService] JSON parse error on line:", dataStr.substring(0, 100));
            continue;
          }
          throw e;
        }
      }
    }
    reader.cancel();
  }

  return generate();
}
