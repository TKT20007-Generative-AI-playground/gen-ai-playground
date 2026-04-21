import axios from "axios"
import { backendUrl } from "../utils/env"

export const apiClient = axios.create({
  baseURL: backendUrl,
  withCredentials: true,
})

export function setAuthHeader(token: string | null): void {
  if (!token) {
    delete apiClient.defaults.headers.common["Authorization"]
    return
  }
  apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`
}
