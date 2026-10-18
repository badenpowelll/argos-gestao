export type Theme = 'light' | 'dark' | 'system';
const KEY = 'argos-theme';

function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

/** Aplica o tema em <html data-theme>. `system` segue a preferência do SO. Persiste a escolha se possível. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): 'light' | 'dark' {
  const resolved = theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme;
  root.dataset.theme = resolved;
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* armazenamento indisponível: ignorar */
  }
  return resolved;
}

export function getStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignorar */
  }
  return 'system';
}
