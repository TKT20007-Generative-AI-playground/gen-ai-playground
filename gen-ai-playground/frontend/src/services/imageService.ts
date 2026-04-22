import axios, { type AxiosResponse } from "axios"
import { apiClient } from "./httpClient"

export function isCanceledRequest(err: unknown): boolean {
  return axios.isCancel(err)
}

export async function generateImageRequest(payload: {
  prompt: string
  model: string
  timeout: number
  signal: AbortSignal
}): Promise<AxiosResponse<Blob>> {
  return apiClient.post(
    "/images/generate",
    {
      prompt: payload.prompt,
      model: payload.model,
    },
    {
      responseType: "blob",
      timeout: payload.timeout,
      signal: payload.signal,
    },
  )
}

export async function editImageRequest(payload: {
  image: string
  prompt: string
  model: string
  parentImageId?: string
  timeout: number
  signal: AbortSignal
  csrfToken: string
}): Promise<AxiosResponse<Blob>> {
  return apiClient.post(
    "/images/edit-image",
    {
      image: payload.image,
      prompt: payload.prompt,
      model: payload.model,
      parent_image_id: payload.parentImageId,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": payload.csrfToken,
      },
      responseType: "blob",
      timeout: payload.timeout,
      signal: payload.signal,
    },
  )
}

export async function fetchBlobByUrl(payload: {
  url: string
  timeout: number
  signal: AbortSignal
}): Promise<AxiosResponse<Blob>> {
  return axios.get(payload.url, {
    responseType: "blob",
    timeout: payload.timeout,
    signal: payload.signal,
  })
}
