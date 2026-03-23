import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import Front from "./pages/Front";
import Register from "./components/Register";
import Playground from "./pages/Playground";
import Dashboard from "./pages/Dashboard";
import History from "./components/History";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminRoute } from "./components/AdminRoute";
import HistorySidebar from "./components/HistorySidebar";
import { useState, useCallback, useEffect } from "react";
import { useAuth } from "./context/AuthContext";

function App() {

  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const [resizing, setResizing] = useState(false);
  const auth = useAuth();

  const startResize = () => setResizing(true);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!resizing) return;
      const newWidth = e.clientX;
      if (newWidth > 250 && newWidth < 800) {
        setSidebarWidth(newWidth);
      }
    },
    [resizing]
  );


  const onMouseUp = useCallback(() => {
    if (resizing) setResizing(false);
  }, [resizing]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  return (
    <BrowserRouter>
      <Header />

      {/* Sidebar toggle button */}
      {auth.isLoggedIn && (
        <button
          type="button"
          aria-label="Toggle history sidebar"
          onClick={() => setHistoryOpen((prev) => !prev)}
          style={{
            position: "fixed",
            top: "50%",
            transform: "translateY(-50%)",
            left: historyOpen ? `${sidebarWidth + 10}px` : "10px",
            zIndex: 2000,
            background: "white",
            border: "1px solid #ddd",
            borderRadius: "4px",
            padding: "6px 10px",
            cursor: "pointer",
            transition: "left 0.25s ease",
          }}
        >
          {historyOpen ? "←" : "→"}
        </button>
      )}

      <div style={{ display: "flex", minHeight: "100vh", height: "100%" }}>
        {auth.isLoggedIn && historyOpen && (
          <div
            style={{
              width: sidebarWidth,
              height: "100%",
              overflow: "hidden",
              borderRight: "1px solid #ddd",
              background: "#f8f9fa",
              position: "relative",
              padding: 16,
              boxSizing: "border-box",
            }}
          >
            <HistorySidebar opened={historyOpen} />

            {/* Resizer handle */}
            <div
              onMouseDown={startResize}
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                width: 6,
                height: "100%",
                cursor: "ew-resize",
                background: "#ccc",
              }}
            />
          </div>
        )}

        <div style={{ flex: 1 }}>
          <Routes>
            <Route path="/" element={<Front />} />

            <Route path="/register" element={<Register />} />

            <Route
              path="/playground"
              element={<Navigate to="/playground/ImageGenerator" replace />}
            />

            <Route
              path="/playground/:tab"
              element={
                <ProtectedRoute>
                  <Playground historyOpen={historyOpen} />
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
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;

