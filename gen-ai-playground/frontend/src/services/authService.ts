import axios from "axios"
import { getCsrfHeaders } from "../utils/auth"
import { backendUrl } from "../utils/env"
import { apiClient, setAuthHeader } from "./httpClient"

const refreshClient = axios.create({
  baseURL: backendUrl,
  withCredentials: true,
})

type RefreshResponse = {
  token: string
}

type MeResponse = {
  username?: string | null
  is_admin?: boolean
}

type LoginResponse = {
  token: string
  username: string
  is_admin?: boolean
}

export async function refreshAccessToken(): Promise<string> {
  const res = await refreshClient.post<RefreshResponse>("/refresh")
  return res.data.token
}

export async function fetchMe(token: string): Promise<MeResponse> {
  const res = await apiClient.get<MeResponse>("/me", {
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.data
}

export async function loginRequest(values: {
  username: string
  password: string
}): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>("/login", values)
  return res.data
}

export async function registerRequest(values: {
  username: string
  password: string
  invitation_code: string
}): Promise<void> {
  await apiClient.post("/register", values)
}

export async function logoutRequest(): Promise<void> {
  await apiClient.post("/logout", {}, { headers: getCsrfHeaders() })
}

export { apiClient, refreshClient, setAuthHeader }
