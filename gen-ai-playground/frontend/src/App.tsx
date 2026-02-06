
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { ImageGenerator } from './components/ImageGenerator'
import Header from "./components/Header"
import Register from "./components/Register" 
import History from "./components/History";



function App() {
  return (
    <>
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<ImageGenerator />} />
          <Route path="/history" element={<History />} /> 
          <Route path="/register" element={<Register />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
export default App
