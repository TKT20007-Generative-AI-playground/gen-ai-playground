import { getJsonCsrfHeaders } from "../utils/auth"
import { apiClient } from "./httpClient"

export type TextModelApiItem = {
  value: string
  label: string
  supports_thinking?: boolean
  model_mode?: "thinking" | "hybrid" | "instruct" | null
}

export type TextModelStatuses = Record<string, "live" | "starting" | "offline" | "unknown">

export type ChatMessagePayload = {
  role: "user" | "assistant"
  content: string
}

export type TextChatResponse = {
  reply: string
  reasoning?: string | null
  generation_time_ms?: number | null
}

export type SharedConversationHistoryResponse = {
  title?: string
  model?: string
  messages?: Array<{
    role: "user" | "assistant"
    content: string
    sender?: string
    reasoning?: string | null
  }>
}

export async function fetchTextModels(): Promise<TextModelApiItem[]> {
  const res = await apiClient.get<{ available_models?: TextModelApiItem[] }>("/text/models")
  return res.data.available_models ?? []
}

export type TextDeployment = {
  name: string
  created_at?: string
  endpoint_url?: string
  model_path?: string | null
}

// Non-admin equivalent of fetchDashboardContainers — backed by /text/deployments,
// which only requires get_current_user. Returns the same `name` field the chat
// flow needs to verify a model is actually deployed.
export async function fetchTextDeployments(): Promise<TextDeployment[]> {
  const res = await apiClient.get<TextDeployment[]>("/text/deployments")
  return res.data ?? []
}

export async function fetchTextModelStatuses(): Promise<TextModelStatuses> {
  const res = await apiClient.get<TextModelStatuses>("/text/model-statuses")
  return res.data
}

export async function chatWithTextModel(payload: {
  model_path: string
  messages: ChatMessagePayload[]
  max_tokens: number
  temperature: number
  top_p: number
  enable_thinking: boolean
}): Promise<TextChatResponse> {
  const res = await apiClient.post<TextChatResponse>("/text/chat", payload, {
    headers: getJsonCsrfHeaders(),
  })
  return res.data
}

export async function createSharedConversation(payload: {
  participants: string[]
  title: string
  initial_messages: Array<{ role: "user" | "assistant"; content: string; reasoning: string | null }>
  model_key: string
}): Promise<{ conversation_id: string; invite_code: string }> {
  const res = await apiClient.post<{ conversation_id: string; invite_code: string }>(
    "/text/conversations",
    payload,
    { headers: getJsonCsrfHeaders() },
  )
  return res.data
}

export async function joinConversation(conversationId: string, inviteCode: string): Promise<void> {
  await apiClient.post(
    `/text/conversations/${conversationId}/join`,
    { invite_code: inviteCode },
    { headers: getJsonCsrfHeaders() },
  )
}

export async function checkConversationParticipant(conversationId: string): Promise<void> {
  await apiClient.get(`/text/conversations/${conversationId}/check-participant`)
}

export async function fetchConversationHistory(
  conversationId: string,
): Promise<SharedConversationHistoryResponse> {
  const res = await apiClient.get<SharedConversationHistoryResponse>(
    `/text/conversation-history/${conversationId}`,
  )
  return res.data
}
