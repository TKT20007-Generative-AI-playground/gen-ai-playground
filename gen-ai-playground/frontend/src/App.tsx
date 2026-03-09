
import { Routes, Route, Navigate } from "react-router-dom"
import Header from "./components/Header"
import Register from "./components/Register"
import Playground from "./pages/Playground"
import History from "./components/History";
import { ProtectedRoute } from "./components/ProtectedRoute"


function App() {
  return (
    <>
      <Header />
      <Routes>

        <Route path="/" element={
          <Navigate to="/playground/ImageGenerator" replace />
        } />

        <Route path="/register" element={<Register />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/playground/:tab" element={<Playground />} />
          <Route path="/history" element={<History />} />
        </Route>

      </Routes>
    </>
  )
}

export default App
