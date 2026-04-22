import { getCsrfHeaders } from "../utils/auth"
import { apiClient } from "./httpClient"

export type AudioModelApiItem = {
  value: string
  label: string
}

export type AudioModelStatuses = Record<string, "live" | "starting" | "offline" | "unknown">

export async function fetchAudioModels(): Promise<AudioModelApiItem[]> {
  const res = await apiClient.get<{ available_models?: AudioModelApiItem[] }>("/audio/models", {
    headers: getCsrfHeaders(),
  })
  return res.data.available_models ?? []
}

export async function fetchAudioModelStatuses(): Promise<AudioModelStatuses> {
  const res = await apiClient.get<AudioModelStatuses>("/audio/model-statuses", {
    headers: getCsrfHeaders(),
  })
  return res.data
}

export async function transcribeAudio(formData: FormData): Promise<{
  text: string
  language?: string
  duration?: number
  transcription_time_ms?: number
  model?: string
  segments?: Array<{ start: number; end: number; text: string }>
}> {
  const res = await apiClient.post<{
    text: string
    language?: string
    duration?: number
    transcription_time_ms?: number
    model?: string
    segments?: Array<{ start: number; end: number; text: string }>
  }>("/audio/transcribe", formData, {
    headers: getCsrfHeaders(),
    timeout: 300000,
  })
  return res.data
}
