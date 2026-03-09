import { useState } from 'react'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('token')
  )
  const [username, setUsername] = useState<string | null>(() =>
    localStorage.getItem('username')
  )
  const [isAdmin, setIsAdmin] = useState<boolean>(() =>
    localStorage.getItem('isAdmin') === 'true'
  )

  const login = (newToken: string, user: string, admin: boolean) => {
    localStorage.setItem('token', newToken)
    localStorage.setItem('username', user)
    localStorage.setItem('isAdmin', String(admin))
    setToken(newToken)
    setUsername(user)
    setIsAdmin(admin)
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('isAdmin')
    setToken(null)
    setUsername(null)
    setIsAdmin(false)
  }

  return (
    <AuthContext.Provider
      value={{ isLoggedIn: !!token, username, isAdmin, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}