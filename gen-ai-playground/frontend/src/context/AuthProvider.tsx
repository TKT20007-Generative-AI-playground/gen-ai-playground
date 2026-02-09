import { useState } from 'react'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('token')
  )
  const [username, setUsername] = useState<string | null>(null)

  const login = (newToken: string, user: string) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('username', user)
    setToken(newToken)
    setUsername(user)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    setToken(null)
    setUsername(null)
  }

  return (
    <AuthContext.Provider
      value={{ isLoggedIn: !!token, username, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}