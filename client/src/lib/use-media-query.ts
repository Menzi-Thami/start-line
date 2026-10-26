import { useEffect, useState } from 'react'

/** Whether a media query matches now, kept up to date as the window changes. False where matchMedia isn't available. */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    onChange()
    list.addEventListener?.('change', onChange)
    return () => list.removeEventListener?.('change', onChange)
  }, [query])
  return matches
}
