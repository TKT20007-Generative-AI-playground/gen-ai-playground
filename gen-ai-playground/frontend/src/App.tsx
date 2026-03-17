import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import Header from "./components/Header"
import Register from "./components/Register"
import Playground from "./pages/Playground"
import Dashboard from "./pages/Dashboard"
import HistoryPage from "./pages/HistoryPage"
import { useAuth } from "./context/AuthContext"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { AdminRoute } from "./components/AdminRoute"

function App() {
  const { isLoggedIn } = useAuth()

  return (
    <BrowserRouter>
      <Header />

      <Routes>
        <Route
          path="/"
          element={
            isLoggedIn ? (
              <Navigate to="/playground/ImageGenerator" replace />
            ) : (
              <div style={{ width: "100%", textAlign: "center", paddingTop: 16 }}>
                <p>You must be logged in to generate images.</p>
              </div>
            )
          }
        />

        <Route path="/register" element={<Register />} />

        <Route path="/playground" element={<Navigate to="/playground/ImageGenerator" replace />} />

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
              <HistoryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <AdminRoute>
              <Dashboard />
            </AdminRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
