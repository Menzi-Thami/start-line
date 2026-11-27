// Synthetic schema mapping example ONLY. No real runner payload belongs in this repository.
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
export function sample() {
  const sessions = []
  let id = 1
  const key = () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`
  const step = (distanceKm, kind = 'Run') => ({ kind, distanceKm, zone: 'Easy', fastestSecondsPerKm: 360, slowestSecondsPerKm: 420, times: 1, steps: [] })
  for (let date = new Date('2026-10-08T00:00:00Z'); date.toISOString().slice(0, 10) < '2026-11-07'; date.setUTCDate(date.getUTCDate() + 1)) {
    const iso = date.toISOString().slice(0, 10), day = date.getUTCDay(), raceWeek = iso >= '2026-11-02'
    if ([2, 4, 0].includes(day)) sessions.push({ id: key(), date: iso, type: day === 0 ? 'LongRun' : 'Easy', title: 'Synthetic private run', targetRpe: 4, zone: 'Easy', steps: [step(raceWeek ? 2 : 6)] })
    if (!raceWeek && [1, 2, 4, 5].includes(day)) sessions.push({ id: key(), date: iso, type: 'Strength', title: 'Synthetic private gym', targetRpe: 4, gym: [1, 5].includes(day) ? 'Lower' : 'Upper', durationMinutes: 40, reducedLoad: true, steps: [], notes: 'Synthetic gym instructions. Keep movement comfortable.' })
  }
  sessions.push({ id: key(), date: '2026-11-07', type: 'Race', title: 'Synthetic private race', targetRpe: 8, zone: 'Race', steps: [step(10)] })
  return { name: 'Synthetic private chapter', baseline: { raceName: 'Synthetic 10K', distanceKm: 10, raceDate: '2026-11-07', goalTime: '01:00:00', runDays: ['Tuesday', 'Thursday', 'Sunday'], longRunDay: 'Sunday', currentWeeklyKm: 25, planFrom: '2026-10-08', startOn: '2026-10-08', version: 3 }, prescription: { schemaVersion: 1, paces: ['Recovery', 'Easy', 'LongRun', 'Tempo', 'Interval', 'Race'].map(zone => ({ zone, fastestSecondsPerKm: 360, slowestSecondsPerKm: 420 })), sessions } }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(sample(), null, 2) + '\n', { mode: 0o600 })
