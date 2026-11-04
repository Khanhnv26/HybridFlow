import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const storageKey = 'hybridflow-theme';

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* The theme also works when browser storage is unavailable. */ }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setTheme(readTheme());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const label = theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  return <button type="button" className="theme-toggle" title={label} aria-label={label}
    onClick={() => {
      const next = theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(storageKey, next); } catch { /* Keep the in-memory choice. */ }
      setTheme(next);
    }}>
    {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
  </button>;
}
