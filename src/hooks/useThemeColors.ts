import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';

/** Resolves theme CSS tokens to concrete colours for SVG/chart libraries (which can't read CSS vars in attributes). */
export function useThemeColors() {
  const { theme } = useTheme();
  return useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const rgb = (name: string) => `rgb(${css.getPropertyValue(name).trim().split(/\s+/).join(',')})`;
    return {
      accent: rgb('--accent'),
      line: rgb('--line'),
      muted: rgb('--muted'),
      faint: rgb('--faint'),
      surface: rgb('--surface'),
      raised: rgb('--raised'),
      ink: rgb('--ink'),
    };
    // theme is the trigger: tokens change when the <html> class flips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);
}
