import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import Header from "./components/Header"
import Front from "./pages/Front"
import Register from "./components/Register"
import Playground from "./pages/Playground"
import DashboardLayout from "./components/DashboardLayout"
import DashboardContainers from "./pages/DashboardContainers"
import DashboardUsers from "./pages/DashboardUsers"
import DashboardInvitations from "./pages/DashboardInvitations"
import History from "./components/History"
// import { useAuth } from "./context/AuthContext"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { AdminRoute } from "./components/AdminRoute"

function AppContent() {
  const { isLoggedIn } = useAuth()
  const location = useLocation()
  
  // Hide Header on dashboard routes
  const isDashboardRoute = location.pathname.startsWith('/dashboard')

  return (
    <>
      {!isDashboardRoute && <Header />}

      <Routes>
        <Route
          path="/"
          element={
              <Front />
          }
        />

        <Route path="/register" element={<Register />} />

        <Route
          path="/playground"
          element={<Navigate to="/playground/ImageGenerator" replace />}
        />

        <Route
          path="/playground/:tab"
          element={
            <ProtectedRoute>
              <Playground />
            </ProtectedRoute>
          }
        />

        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />

        {/* Dashboard routes with standalone layout */}
        <Route
          path="/dashboard"
          element={
            <AdminRoute>
              <DashboardLayout />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard/containers" replace />} />
          <Route path="containers" element={<DashboardContainers />} />
          <Route path="users" element={<DashboardUsers />} />
          <Route path="invitations" element={<DashboardInvitations />} />
        </Route>
      </Routes>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
