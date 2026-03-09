import { createContext, useContext } from 'react'

interface AuthContextType {
  isLoggedIn: boolean
  username: string | null
  isAdmin: boolean
  login: (username: string, isAdmin: boolean) => void
  logout: () => void
}

export const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}