import { useCallback, useEffect, useState } from 'react';
import { writeStorage } from '../lib/storage';

const THEME_KEY = 'myai-theme';

export function useTheme() {
  const [theme, setTheme] = useState(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      writeStorage(THEME_KEY, next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
