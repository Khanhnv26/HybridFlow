import { Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark';
const storageKey = 'hybridflow-theme';

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* The theme also works when browser storage is unavailable. */ }
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeToggle({ className }: { className?: string } = {}) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const transitionTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => {
    clearTimeout(transitionTimer.current);
    if (typeof document !== 'undefined') document.documentElement.classList.remove('theme-changing');
  }, []);
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    }
  }, [theme]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) setTheme(readTheme());
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const label = theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  return <button type="button" className={className || "theme-toggle"} title={label} aria-label={label}
    onClick={() => {
      const next = theme === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') {
        document.documentElement.classList.add('theme-changing');
        clearTimeout(transitionTimer.current);
        transitionTimer.current = setTimeout(() => document.documentElement.classList.remove('theme-changing'), 260);
      }
      try { localStorage.setItem(storageKey, next); } catch { /* Keep the in-memory choice. */ }
      setTheme(next);
    }}>
    <span key={theme} className="theme-toggle-icon">{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</span>
  </button>;
}
