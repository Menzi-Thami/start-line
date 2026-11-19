import type { Units } from '../../lib/types'

// Miles where runners count in miles (the United States, Liberia, Myanmar); kilometres everywhere else. The profile can
// change it at any time.
const MILE_REGIONS = new Set(['US', 'LR', 'MM'])
export function unitsForLocale(locale: string | undefined): Units {
  try {
    const region = locale ? new Intl.Locale(locale).region : undefined
    return region && MILE_REGIONS.has(region) ? 'Miles' : 'Kilometres'
  } catch {
    return 'Kilometres'
  }
}
