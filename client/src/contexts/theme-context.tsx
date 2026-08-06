import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest } from "@/lib/queryClient";

export type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  isSaving: boolean;
  updateTheme: (theme: ThemeMode) => Promise<void>;
}

const THEME_STORAGE_KEY = "o5my-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeTheme(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : "light";
}

function readInitialTheme(): ThemeMode {
  try {
    const cachedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (cachedTheme === "light" || cachedTheme === "dark") return cachedTheme;
  } catch {
    // Local storage can be unavailable in strict privacy modes.
  }

  // Default to light mode when no explicit preference is stored.
  return "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The database remains the source of truth when local storage is unavailable.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<ThemeMode>(readInitialTheme);
  const [isSaving, setIsSaving] = useState(false);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (user) setTheme(normalizeTheme(user.theme));
  }, [user]);

  const updateTheme = useCallback(async (nextTheme: ThemeMode) => {
    if (nextTheme === theme || isSaving) return;

    const previousTheme = theme;
    setTheme(nextTheme);
    setIsSaving(true);

    try {
      const response = await apiRequest("PUT", "/api/settings/theme", { theme: nextTheme });
      const saved = await response.json() as { theme?: unknown };
      setTheme(normalizeTheme(saved.theme));
    } catch (error) {
      setTheme(previousTheme);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, theme]);

  return (
    <ThemeContext.Provider value={{ theme, isSaving, updateTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
