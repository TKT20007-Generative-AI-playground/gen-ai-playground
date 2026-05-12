import { getCsrfHeaders, getJsonCsrfHeaders } from "../utils/auth"
import { apiClient } from "./httpClient"

export type VideoModelApiItem = {
  value: string
  label: string
}

export type VideoModelStatuses = Record<string, "live" | "starting" | "offline" | "unknown">

export type VideoGeneratePayload = {
  prompt: string
  model_path: string
  negative_prompt?: string
  height?: number
  width?: number
  num_frames?: number
  num_inference_steps?: number
  guidance_scale?: number
  seed?: number
}

export type VideoGenerateResponse = {
  video_base64: string
  mime_type: string
  model: string
  generation_time_ms?: number
  height?: number
  width?: number
  num_frames?: number
  fps?: number
  seed?: number
}

export async function fetchVideoModels(): Promise<VideoModelApiItem[]> {
  const res = await apiClient.get<{ available_models?: VideoModelApiItem[] }>("/video/models", {
    headers: getCsrfHeaders(),
  })
  return res.data.available_models ?? []
}

export async function fetchVideoModelStatuses(): Promise<VideoModelStatuses> {
  const res = await apiClient.get<VideoModelStatuses>("/video/model-statuses", {
    headers: getCsrfHeaders(),
  })
  return res.data
}

export async function generateVideo(payload: VideoGeneratePayload): Promise<VideoGenerateResponse> {
  const res = await apiClient.post<VideoGenerateResponse>("/video/generate", payload, {
    headers: getJsonCsrfHeaders(),
    timeout: 600000,
  })
  return res.data
}
