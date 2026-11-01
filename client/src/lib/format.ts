export type Units = 'km' | 'mi'

export const KM_PER_MILE = 1.609344

/** "5:41/km". Seconds round first, so 5:59.6 becomes 6:00 rather than 5:60. */
export function formatPace(secondsPerKm: number, units: Units): string {
  const perUnit = Math.round(units === 'mi' ? secondsPerKm * KM_PER_MILE : secondsPerKm)
  const minutes = Math.floor(perUnit / 60)
  const seconds = perUnit % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}/${units}`
}

/** "5:26–5:41/km", or a single pace when both ends match. */
export function formatPaceRange(fastest: number, slowest: number, units: Units): string {
  const fast = formatPace(fastest, units)
  const slow = formatPace(slowest, units)
  return fast === slow ? fast : `${fast.replace(`/${units}`, '')}–${slow}`
}

export function formatDistance(km: number, units: Units): string {
  const value = units === 'mi' ? km / KM_PER_MILE : km
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${units}`
}

export function toKilometres(value: number, units: Units): number {
  return units === 'mi' ? value * KM_PER_MILE : value
}

/** .NET serialises TimeSpan as "hh:mm:ss", or "d.hh:mm:ss" past a day. */
export function parseTimeSpan(value: string): number | null {
  const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(value)
  if (!match) return null
  const [, days = '0', hours = '0', minutes = '0', seconds = '0'] = match
  return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

export function toTimeSpan(totalSeconds: number): string {
  const whole = Math.max(0, Math.round(totalSeconds))
  const days = Math.floor(whole / 86400)
  const hours = Math.floor((whole % 86400) / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const seconds = whole % 60
  const clock = [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':')
  return days > 0 ? `${days}.${clock}` : clock
}

/** "3:45:00" for long efforts, "24:30" under an hour. */
export function formatDuration(totalSeconds: number): string {
  const whole = Math.round(totalSeconds)
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const seconds = whole % 60
  const mmss = `${String(minutes).padStart(hours > 0 ? 2 : 1, '0')}:${String(seconds).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${mmss}` : mmss
}

const dateFormats = {
  short: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
  long: new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  dayMonth: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }),
  year: new Intl.DateTimeFormat('en-GB', { year: 'numeric', timeZone: 'UTC' }),
}

/**
 * Plan dates are calendar dates ("2027-06-13"), so they're formatted in UTC to stop time zones
 * shifting the day. Built from parts because ICU versions disagree on commas ("Sunday, 13 June").
 */
export function formatDate(isoDate: string, style: keyof typeof dateFormats = 'short'): string {
  return dateFormats[style]
    .formatToParts(new Date(`${isoDate}T00:00:00Z`))
    .filter((part) => part.type !== 'literal')
    .map((part) => part.value)
    .join(' ')
}

/** Today's date where the runner is, as "yyyy-mm-dd". */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** A timestamp as the day and month in the runner's own time zone, e.g. "9 Oct". */
export function formatShortDay(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
}
