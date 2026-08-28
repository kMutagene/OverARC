import { useEffect, useState } from 'react';
import type { Theme } from '../../shared/types';

/** Chooses the persisted theme first and otherwise follows the operating-system preference. */
function initialTheme(): Theme {
  const stored = window.localStorage.getItem('overarc.theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Owns theme state and synchronizes it to DOM colors, browser chrome, and local storage. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // Keep DOM widgets, browser chrome, and persistence synchronized from one source of truth.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0f1515' : '#f7faf8');
    window.localStorage.setItem('overarc.theme', theme);
  }, [theme]);

  return {
    theme,
    /** Toggles themes; the synchronization effect applies and persists the next value. */
    toggleTheme: () => setTheme((current) => (current === 'light' ? 'dark' : 'light')),
  };
}
