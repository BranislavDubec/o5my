import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

interface AuthUser {
  id: number;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  theme: "light" | "dark";
  emailVerified: boolean;
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; firstName: string; lastName: string; nickname: string; phone?: string }) => Promise<void>;
  updateProfile: (data: { firstName: string; lastName: string; nickname: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiRequest("GET", "/api/auth/me")
      .then(res => res.ok ? res.json() : null)
      .then(data => { setUser(data); })
      .catch(() => { setUser(null); })
      .finally(() => { setIsLoading(false); });
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setUser(data);
  };

  const register = async (data: { email: string; password: string; firstName: string; lastName: string; nickname: string; phone?: string }) => {
    await apiRequest("POST", "/api/auth/register", data);
  };

  const updateProfile = async (data: { firstName: string; lastName: string; nickname: string }) => {
    const response = await apiRequest("PUT", "/api/auth/profile", data);
    setUser(await response.json());
  };

  const logout = async () => {
    await apiRequest("POST", "/api/auth/logout");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
