
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ImageGenerator } from './components/ImageGenerator';
import Header from "./components/Header"


function App() {
  return (
    <>
      <BrowserRouter>
        <Header />
        <Routes>
          <Route path="/" element={<ImageGenerator />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}
export default App
