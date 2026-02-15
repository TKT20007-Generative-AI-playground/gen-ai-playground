
import { BrowserRouter, Routes, Route } from "react-router-dom"
import Header from "./components/Header"
import Register from "./components/Register"
import Playground from "./pages/Playground"
import { useAuth } from "./context/AuthContext"
import History from "./components/History";



function App() {
  const { isLoggedIn } = useAuth()
  return (
    <>
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={isLoggedIn ? <Playground /> : <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
              padding: 40,
            }}
          >
            <p>You must be logged in to generate images.</p>
          </div>} />
          <Route path="/register" element={<Register />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/history" element={<History />} /> 
        </Routes>
      </BrowserRouter>
    </>
  )
}
export default App
