import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import Header from "./components/Header"
import Register from "./components/Register"
import Playground from "./components/Playground"
import History from "./components/History"
import { useAuth } from "./context/AuthContext"
import { ProtectedRoute } from "./components/ProtectedRoute"

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

        {/* Redirect /playground → default tab */}
        <Route
          path="/playground"
          element={<Navigate to="/playground/ImageGenerator" replace />}
        />

        {/* Tab-based Playground */}
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
      </Routes>
    </BrowserRouter>
  )
}

export default App
