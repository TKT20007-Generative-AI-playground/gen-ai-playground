import { useState, useEffect, useCallback } from 'react'
import { AuthContext } from './AuthContext'

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (!payload.exp) return false
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem('token')
    if (stored && isTokenExpired(stored)) {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      return null
    }
    return stored
  })
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem('username')
  )

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    setToken(null)
    setUsername(null)
  }, [])

  const checkToken = useCallback((): boolean => {
    const stored = localStorage.getItem('token')
    if (!stored || isTokenExpired(stored)) {
      logout()
      return false
    }
    return true
  }, [logout])

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const stored = localStorage.getItem('token')
    if (!stored || isTokenExpired(stored)) {
      logout()
      throw new Error('Token expired')
    }
    const headers = {
      Authorization: `Bearer ${stored}`,
      'Content-Type': 'application/json',
    }

    const backendUrl = import.meta.env.VITE_API_URL
    fetch(`${backendUrl}/refresh`, {
      method: 'POST',
      headers,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.token) {
          localStorage.setItem('token', data.token)
          setToken(data.token)
        }
      })
      .catch(() => {})

    return headers
  }, [logout])

  const login = (newToken: string, user: string) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('username', user)
    setToken(newToken)
    setUsername(user)
  }

  useEffect(() => {
    if (!token) return
    const checkExpiry = () => {
      if (isTokenExpired(token)) logout()
    }
    const interval = setInterval(checkExpiry, 60_000)
    return () => clearInterval(interval)
  }, [token, logout])

  return (
    <AuthContext.Provider
      value={{ isLoggedIn: !!token, username, login, logout, checkToken, getAuthHeaders }}
    >
      {children}
    </AuthContext.Provider>
  )
}