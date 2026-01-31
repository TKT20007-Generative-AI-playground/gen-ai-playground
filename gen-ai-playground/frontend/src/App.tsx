
import { BrowserRouter, Routes, Route } from "react-router-dom"
import ImageGenerator  from './components/ImageGenerator'
import Header from "./components/Header"
import Playground from "./pages/Playground"

function App() {
  return (
    <>
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<ImageGenerator />} />
          <Route path ="/playground" element ={<Playground/>} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
export default App
