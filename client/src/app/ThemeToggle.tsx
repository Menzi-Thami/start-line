import { useState } from 'react'
import { chooseTheme, currentTheme, themeChoosable, type Theme } from '../lib/theme'

/** The website's light/dark switch. The installed app has none: it follows the phone. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  if (!themeChoosable()) return null
  const dark = theme === 'dark'

  const toggle = () => {
    const next: Theme = dark ? 'light' : 'dark'
    chooseTheme(next)
    setTheme(next)
  }

  return (
    <button type="button" className="theme-toggle" aria-pressed={dark} aria-label="Dark mode" onClick={toggle}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        {dark ? (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
          </g>
        )}
      </svg>
    </button>
  )
}
