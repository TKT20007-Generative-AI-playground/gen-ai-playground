import { useState, useEffect } from "react";
import { AuthContext } from "./AuthContext";

const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);

  const isLoggedIn = !!username;

  // Rehydrate state from backend on mount
  useEffect(() => {
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

  // Login function
  const login = (username: string) => {
    setUsername(username)  // just update state
  };

  // Logout calls backend to clear httpOnly cookie
  const logout = async () => {
    try {
      await fetch(`${backendUrl}/logout`, {
        method: "POST",
        credentials: "include", // include cookie
      });
    } finally {
      setUsername(null); // always clear frontend state
    }
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}