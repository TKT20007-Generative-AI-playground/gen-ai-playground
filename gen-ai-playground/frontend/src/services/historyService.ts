import type { AxiosRequestConfig } from "axios"
import { apiClient } from "./httpClient"

export type HistoryType = "image" | "text" | "audio" | "shared-chat"

export async function fetchSidebarHistory<T = unknown>(
  historyType: HistoryType,
  limit: number,
  audioFetchLimit: number,
): Promise<{ history?: T[] }> {
  const endpointByType: Record<HistoryType, string> = {
    image: "/images/history-sidebar",
    text: "/text/history-sidebar",
    audio: "/audio/history-sidebar",
    "shared-chat": "/text/shared-conversations-sidebar",
  }

  const paramsByType: Record<HistoryType, { limit: number } | undefined> = {
    image: { limit },
    text: { limit },
    audio: { limit: audioFetchLimit },
    "shared-chat": { limit },
  }

  const res = await apiClient.get<{ history?: T[] }>(endpointByType[historyType], {
    params: paramsByType[historyType],
  })
  return res.data
}

export async function fetchConversationHistoryList(
  params: URLSearchParams,
): Promise<{ conversations?: unknown[]; total_pages?: number }> {
  const res = await apiClient.get<{ conversations?: unknown[]; total_pages?: number }>(
    "/text/all-conversations",
    {
      params,
    },
  )
  return res.data
}

export async function fetchTextHistoryList(
  params: URLSearchParams,
): Promise<{ history?: unknown[]; total_pages?: number }> {
  const res = await apiClient.get<{ history?: unknown[]; total_pages?: number }>("/text/history", {
    params,
  })
  return res.data
}

export async function fetchImagesHistoryList(
  params: URLSearchParams,
): Promise<{ history?: unknown[]; total_pages?: number }> {
  const res = await apiClient.get<{ history?: unknown[]; total_pages?: number }>("/images/history", {
    params,
  })
  return res.data
}

export async function fetchAudioHistoryList(
  params: URLSearchParams,
): Promise<{ history?: unknown[]; total_pages?: number; total?: number }> {
  const res = await apiClient.get<{ history?: unknown[]; total_pages?: number; total?: number }>(
    "/audio/history",
    {
      params,
    },
  )
  return res.data
}

async function fetchLength(path: string, config?: AxiosRequestConfig): Promise<number> {
  try {
    const res = await apiClient.get<{ length?: number }>(path, config)
    return res.data.length ?? 0
  } catch {
    return 0
  }
}

export function fetchImagesLength(): Promise<number> {
  return fetchLength("/images/history-length")
}

export function fetchTextLength(): Promise<number> {
  return fetchLength("/text/chat-messages-length")
}

export async function fetchAudioLength(): Promise<number> {
  try {
    const res = await apiClient.get<{ total?: number }>("/audio/history", {
      params: { page: 1 },
    })
    return res.data.total ?? 0
  } catch {
    return 0
  }
}

export function fetchConversationsLength(): Promise<number> {
  return fetchLength("/text/conversations-length")
}
