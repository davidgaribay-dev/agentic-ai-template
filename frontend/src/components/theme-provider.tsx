import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { useEffectiveThemeSettings } from "@/lib/queries";
import { useWorkspace } from "@/lib/workspace";
import { isLoggedIn } from "@/lib/auth";
import type { ThemeMode, ThemeColors } from "@/lib/api";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  effectiveColors: ThemeColors | null;
  customizationAllowed: boolean;
  isLoading: boolean;
};

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  effectiveColors: null,
  customizationAllowed: true,
  isLoading: false,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "ui-theme",
}: ThemeProviderProps) {
  const [localTheme, setLocalTheme] = useState<ThemeMode>(
    () => (localStorage.getItem(storageKey) as ThemeMode) || defaultTheme,
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  const { currentOrg, currentTeam } = useWorkspace();

  const { data: effectiveSettings, isLoading } = useEffectiveThemeSettings(
    isLoggedIn() ? currentOrg?.id : undefined,
    isLoggedIn() ? currentTeam?.id : undefined,
    systemPrefersDark,
  );

  const theme = effectiveSettings?.theme_mode ?? localTheme;
  const effectiveColors = effectiveSettings?.active_theme_colors ?? null;
  const customizationAllowed = effectiveSettings?.customization_allowed ?? true;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    let resolvedTheme: "light" | "dark";
    if (theme === "system") {
      resolvedTheme = systemPrefersDark ? "dark" : "light";
    } else {
      resolvedTheme = theme;
    }

    root.classList.add(resolvedTheme);

    if (effectiveColors) {
      // Cache theme colors in localStorage for immediate application on next page load
      localStorage.setItem("ui-theme-colors", JSON.stringify(effectiveColors));

      Object.entries(effectiveColors).forEach(([key, value]) => {
        const cssVar = key.replace(/_/g, "-");
        root.style.setProperty(`--${cssVar}`, value);
      });
    }
  }, [theme, systemPrefersDark, effectiveColors]);

  const setTheme = useCallback(
    (newTheme: ThemeMode) => {
      if (!isLoggedIn()) {
        localStorage.setItem(storageKey, newTheme);
        setLocalTheme(newTheme);
      }
    },
    [storageKey],
  );

  const value = useMemo<ThemeProviderState>(
    () => ({
      theme,
      setTheme,
      effectiveColors,
      customizationAllowed,
      isLoading,
    }),
    [theme, setTheme, effectiveColors, customizationAllowed, isLoading],
  );

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
