import { useState, useEffect, useCallback, useRef } from "react";
import { AuthContext } from "./AuthContext";
import axios from "axios";

const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  const isLoggedIn = !!username;

  // Rehydrate state from backend on mount
  useEffect(() => {
    // Cleanup legacy client-side tokens from older auth flow
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("isAdmin");

    async function fetchMe() {
      try {
        const res = await axios.get(`${backendUrl}/me`, { withCredentials: true });
        setUsername(res.data.username || null);
        setIsAdmin(res.data.is_admin || false);
      } catch {
        setUsername(null);
        setIsAdmin(false);
      }
    }

    fetchMe();
  }, []);

  const isHandlingExpiry = useRef(false);

  const handleSessionExpired = useCallback(() => {
    if (isHandlingExpiry.current) return;
    isHandlingExpiry.current = true;
    setUsername(null);
    setIsAdmin(false);
  }, []);

  // Poll /me instead — it's the authoritative session check
  useEffect(() => {
    if (!username) return;

    const interval = setInterval(() => {
      axios.get(`${backendUrl}/me`, { withCredentials: true })
        .catch((error) => {
          if (error.response?.status === 401) {
            handleSessionExpired();
          }
        });
    }, 60_000);

    return () => clearInterval(interval);
  }, [username, handleSessionExpired]);

  // Global axios interceptor: redirect on 401
  const interceptorId = useRef<number | null>(null);
  useEffect(() => {
    interceptorId.current = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          handleSessionExpired();
        }
        return Promise.reject(error);
      }
    );
    return () => {
      if (interceptorId.current !== null) {
        axios.interceptors.response.eject(interceptorId.current);
      }
    };
  }, [handleSessionExpired]);

  const login = useCallback(async () => {
    const res = await axios.get(`${backendUrl}/me`, { withCredentials: true });
    setUsername(res.data.username || null);
    setIsAdmin(res.data.is_admin || false);
  }, []);

  // Logout calls backend to clear httpOnly cookie
  const logout = async () => {
    try {
      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrf_token="))
        ?.split("=")[1] ?? "";

      await axios.post(
        `${backendUrl}/logout`,
        {},                          // empty body
        {
          withCredentials: true,
          headers: { "X-CSRF-Token": csrfToken },
        }
      );
    } finally {
      setUsername(null);
      setIsAdmin(false);
    }
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, username, isAdmin, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}