import { createContext, useContext } from "react"

interface AuthContextType {
  isLoggedIn: boolean
  username: string | null
  isAdmin: boolean
  login: (token: string, username: string, isAdmin: boolean) => void // ← updated
  logout: () => void
  getAccessToken: () => string | null
}

export const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside AuthProvider")
  return context
}
