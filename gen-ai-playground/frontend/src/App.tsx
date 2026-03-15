import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import Header from "./components/Header"
import Main from "./pages/Main"
import Register from "./components/Register"
import Playground from "./pages/Playground"
import Dashboard from "./pages/Dashboard"
import History from "./components/History"
// import { useAuth } from "./context/AuthContext"
import { ProtectedRoute } from "./components/ProtectedRoute"
import { AdminRoute } from "./components/AdminRoute"

function App() {
  // const { isLoggedIn } = useAuth()

  return (
    <BrowserRouter>
      <Header />

      <Routes>
        <Route
          path="/"
          element={
              <Main />
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
