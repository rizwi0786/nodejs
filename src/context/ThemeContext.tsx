import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { readString, writeString } from '../services/storage';

export type Theme = 'dark' | 'light';

interface ThemeApi {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Dark is the primary theme; light is opt-in and remembered.
  const [theme, setTheme] = useState<Theme>(() => (readString('theme') === 'light' ? 'light' : 'dark'));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    writeString('theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
