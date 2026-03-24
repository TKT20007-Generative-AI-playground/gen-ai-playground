import { useState, useEffect, useCallback, useRef } from "react"
import { AuthContext } from "./AuthContext"
import axios from "axios"

const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:8000"

// Separate axios instance to avoid the global interceptor catching its own 401 and triggering an infinite retry loop
const refreshClient = axios.create({ baseURL: backendUrl, withCredentials: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [isReady, setIsReady] = useState(false) // prevent flashing logged-out UI on mount

  const isLoggedIn = !!username

  // In-memory access token — never touches localStorage
  const accessTokenRef = useRef<string | null>(null)

  const clearSession = useCallback(() => {
    accessTokenRef.current = null
    delete axios.defaults.headers.common["Authorization"]
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
      // If there's no csrf_token cookie, there's no past session to restore
      const hasCsrf = document.cookie.split("; ").some(c => c.startsWith("csrf_token="))
      if (!hasCsrf) {
        setIsReady(true)
        return
      }

      try {
        const res = await refreshClient.post("/refresh")
        accessTokenRef.current = res.data.token
        axios.defaults.headers.common["Authorization"] = `Bearer ${res.data.token}`

        const me = await axios.get(`${backendUrl}/me`, {
          withCredentials: true,
          headers: { Authorization: `Bearer ${accessTokenRef.current}` },
        })
        setUsername(me.data.username || null)
        setIsAdmin(me.data.is_admin || false)
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
    interceptorId.current = axios.interceptors.response.use(
      response => response,
      async error => {
        const original = error.config
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
              resolve(axios(original))
            })
          })
        }

        original._retried = true
        isRefreshing.current = true

        try {
          const res = await refreshClient.post("/refresh")
          const newToken = res.data.token
          accessTokenRef.current = newToken
          axios.defaults.headers.common["Authorization"] = `Bearer ${newToken}`
          flushQueue(newToken)
          original.headers = original.headers ?? {}
          original.headers["Authorization"] = `Bearer ${newToken}`
          return axios(original) // retry original request
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
        axios.interceptors.response.eject(interceptorId.current)
      }
    }
  }, [clearSession])

  const login = useCallback(async (token: string, newUsername: string, newIsAdmin: boolean) => {
    // Login page receives the access token in the response body — store in memory
    accessTokenRef.current = token
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`
    setUsername(newUsername)
    setIsAdmin(newIsAdmin)
  }, [])

  const logout = useCallback(async () => {
    try {
      const csrfToken =
        document.cookie
          .split("; ")
          .find(c => c.startsWith("csrf_token="))
          ?.split("=")[1] ?? ""

      await axios.post(
        `${backendUrl}/logout`,
        {},
        {
          withCredentials: true,
          headers: { "X-CSRF-Token": csrfToken },
        },
      )
    } finally {
      clearSession()
    }
  }, [clearSession])

  if (!isReady) return null // prevents flashing logged-out UI

  return (
    <AuthContext.Provider value={{ isLoggedIn, username, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
