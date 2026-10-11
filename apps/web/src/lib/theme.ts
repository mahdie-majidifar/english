/**
 * Light or dark. The choice lives in a cookie, so the server can put it on `<html data-theme>` before the
 * page is drawn (no flash, and no inline script, which the Content-Security-Policy would not allow).
 * "System" is the absence of the attribute: the device's own setting decides, in CSS.
 */
export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEMES)[number];

export const THEME_COOKIE = 'ec_theme';

export function parseTheme(value: string | undefined | null): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** What the page is showing right now. */
export function readTheme(): ThemeChoice {
  return parseTheme(document.documentElement.getAttribute('data-theme'));
}

/** Light or dark for a choice, asking the device when the choice is "system". */
export function effectiveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Switches the page now and remembers the choice for a year. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  document.cookie = `${THEME_COOKIE}=${choice}; path=/; max-age=31536000; samesite=lax`;
}
