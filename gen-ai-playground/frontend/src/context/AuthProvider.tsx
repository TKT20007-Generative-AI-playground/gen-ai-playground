import { useState, useEffect, useCallback, useRef } from "react"
import { AuthContext } from "./AuthContext"
import {
  apiClient,
  fetchMe,
  logoutRequest,
  refreshAccessToken,
  setAuthHeader,
} from "../services/authService"
import { notifications } from '@mantine/notifications'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [isReady, setIsReady] = useState(false) // prevent flashing logged-out UI on mount

  const isLoggedIn = !!username

  // In-memory access token — never touches localStorage
  const accessTokenRef = useRef<string | null>(null)

  const clearSession = useCallback(() => {
    accessTokenRef.current = null
    setAuthHeader(null)
    setUsername(null)
    setIsAdmin(false)
  }, [])

  // Rehydrate on mount by attempting a token refresh
  // If refresh cookie is still valid, we get a new access token silently
  useEffect(() => {
    // Cleanup legacy client-side tokens from older auth flow
    localStorage.removeItem("token")
    localStorage.removeItem("username")
    localStorage.removeItem("isAdmin")

    async function rehydrate() {
      try {
        const token = await refreshAccessToken()
        accessTokenRef.current = token
        setAuthHeader(token)

        const me = await fetchMe(token)
        setUsername(me.username || null)
        setIsAdmin(me.is_admin || false)
      } catch {
        clearSession()
      } finally {
        setIsReady(true) // render children only after we know auth state
      }
    }

    rehydrate()
  }, [clearSession])

  // Refresh lock: if multiple requests 401 simultaneously, only one refresh fires
  const isRefreshing = useRef(false)
  const refreshQueue = useRef<((token: string | null) => void)[]>([])

  const flushQueue = (token: string | null) => {
    refreshQueue.current.forEach(cb => cb(token))
    refreshQueue.current = []
  }

  // Global axios interceptor: silently refresh on 401, then retry original request
  const interceptorId = useRef<number | null>(null)
  useEffect(() => {
    interceptorId.current = apiClient.interceptors.response.use(
      response => response,
      async error => {
        const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined
        if (!original) {
          return Promise.reject(error)
        }

        // Only attempt refresh once per request (avoid infinite loop)
        if (error.response?.status !== 401 || original._retried) {
          return Promise.reject(error)
        }

        if (isRefreshing.current) {
          // Queue this request until the in-flight refresh completes
          return new Promise((resolve, reject) => {
            refreshQueue.current.push(token => {
              if (!token) return reject(error)
              original.headers = original.headers ?? {}
              original.headers["Authorization"] = `Bearer ${token}`
              resolve(apiClient(original))
            })
          })
        }

        original._retried = true
        isRefreshing.current = true

        try {
          const newToken = await refreshAccessToken()
          accessTokenRef.current = newToken
          setAuthHeader(newToken)
          flushQueue(newToken)
          original.headers = original.headers ?? {}
          original.headers["Authorization"] = `Bearer ${newToken}`
          return apiClient(original) // retry original request
        } catch {
          flushQueue(null)
          clearSession()
          return Promise.reject(error)
        } finally {
          isRefreshing.current = false
        }
      },
    )

    return () => {
      if (interceptorId.current !== null) {
        apiClient.interceptors.response.eject(interceptorId.current)
      }
    }
  }, [clearSession])

  const login = useCallback(async (token: string, newUsername: string, newIsAdmin: boolean) => {
    // Login page receives the access token in the response body — store in memory
    accessTokenRef.current = token
    setAuthHeader(token)
    setUsername(newUsername)
    setIsAdmin(newIsAdmin)
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
      notifications.show({
        title: "Logged out",
        message: "You have been successfully logged out.",
        color: "blue",
      })
    } finally {
      clearSession()
    }
  }, [clearSession])

  if (!isReady) return null // prevents flashing logged-out UI

  return (
    <AuthContext.Provider value={{ isLoggedIn, username, isAdmin, login, logout, getAccessToken: () => accessTokenRef.current }}>
      {children}
    </AuthContext.Provider>
  )
}
