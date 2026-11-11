// Light or dark. Both the website and installed PWA respect the runner's saved choice;
// without a choice, follow the device (tokens.css).
export type Theme = 'light' | 'dark'

const THEME_KEY = 'taperday:theme'
const PAGE: Record<Theme, string> = { light: '#e4e4e4', dark: '#0b0b0b' }

function stored(): Theme | null {
  try {
    const value = window.localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function deviceTheme(): Theme {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** The theme the page shows now. */
export function currentTheme(): Theme {
  return stored() || deviceTheme()
}

function apply(theme: Theme | null) {
  const root = document.documentElement
  if (theme) root.dataset.theme = theme
  else delete root.dataset.theme
  // The browser bar matches the page: with a choice made, both theme-color tags say the chosen colour.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = theme ? PAGE[theme] : PAGE[(meta.media.includes('dark') ? 'dark' : 'light') as Theme]
  }
}

/** Applies the remembered choice before the first paint on both web and PWA. */
export function applyStoredTheme(): void {
  apply(stored())
}

/** Remembers the runner's choice on this device and shows it. */
export function chooseTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Private browsing: the choice still applies for this visit.
  }
  apply(theme)
}
