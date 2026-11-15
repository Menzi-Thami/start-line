import { useEffect, useState } from 'react'
import { localToday } from './format'

/** Keep the current phase correct across midnight and when an installed app returns from the background. */
export function todayInZone(now: Date, timeZone?: string): string {
  if (!timeZone) return localToday(now)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (kind: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === kind)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function useToday(timeZone?: string): string {
  const [today, setToday] = useState(() => todayInZone(new Date(), timeZone))
  useEffect(() => {
    let timer: number
    const refresh = () => {
      const now = new Date()
      setToday(todayInZone(now, timeZone))
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now)
      const get = (kind: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === kind)?.value ?? 0)
      const toMidnight = (86400 - get('hour') * 3600 - get('minute') * 60 - get('second')) * 1000 + 50
      window.clearTimeout(timer)
      timer = window.setTimeout(refresh, Math.min(60_000, toMidnight))
    }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [timeZone])
  return today
}
