
import { BrowserRouter, Routes, Route } from "react-router-dom"
import Header from "./components/Header"
import Register from "./components/Register"
import Playground from "./pages/Playground"
import History from "./components/History";
import { useAuth } from './context/AuthContext'
import { ProtectedRoute } from "./components/ProtectedRoute"
import { Navigate } from 'react-router-dom'

function App() {
  const { isLoggedIn } = useAuth()

  return (
    <>
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={
            isLoggedIn ? (<Navigate to="/playground" replace />) : (
              <div>
                <p>You must be logged in to generate images.</p>
              </div>
            )
          } />
          <Route path="/register" element={<Register />} />
          <Route path="/playground" element={
            <ProtectedRoute>
              <Playground />
            </ProtectedRoute>
          } />
          <Route path="/history" element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          } />

        </Routes>
      </BrowserRouter>
    </>
  )
}
export default App
