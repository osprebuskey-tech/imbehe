import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const KEY = 'imbehe.theme';
const ThemeContext = createContext({ theme: 'light', setTheme: () => {}, toggleTheme: () => {} });

const read = () => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage can be blocked: fall through to the system setting */ }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(read);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0c1a1d' : '#87B6BC');
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try { localStorage.setItem(KEY, next); } catch { /* not persisted, still applied */ }
  }, []);
  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
