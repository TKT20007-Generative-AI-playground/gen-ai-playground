import { useState, useEffect } from "react";
import { AuthContext } from "./AuthContext";

const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);

  const isLoggedIn = !!username;

  // Rehydrate state from backend on mount
  useEffect(() => {
    // Cleanup legacy client-side tokens from older auth flow
    localStorage.removeItem("token");
    localStorage.removeItem("username");

    async function fetchMe() {
      try {
        const res = await fetch(`${backendUrl}/me`, {
          credentials: "include", // send httpOnly cookie
        });

        if (res.ok) {
          const data = await res.json();
          setUsername(data.username || null);
        } else {
          setUsername(null);
        }
      } catch {
        setUsername(null);
      }
    }

    fetchMe();
  }, []);

  // Login function - only updates state, cookie is set by backend
  const login = (user: string) => {
    setUsername(user);
  };

  // Logout calls backend to clear httpOnly cookie
  const logout = async () => {
    try {
      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrf_token="))
        ?.split("=")[1] ?? "";
      await fetch(`${backendUrl}/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRF-Token": csrfToken },
      });
    } finally {
      setUsername(null); // clear frontend state
    }
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}