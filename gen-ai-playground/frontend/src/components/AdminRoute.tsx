import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isAdmin } = useAuth()

  if (!isLoggedIn) {
    return <Navigate to="/" replace />
  }

  if (!isAdmin) {
    return <Navigate to="/playground" replace />
  }

  return <>{children}</>
}
