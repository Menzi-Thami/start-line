import { describe, expect, it } from 'vitest'
import { stickerExtraLines, stickerLines } from './run-sticker'

describe('run stickers use actual metrics', () => {
  it('calculates pace from actual distance and time in the chosen units', () => {
    const run = { date: '2026-10-28', title: 'Easy long run', distanceKm: 10, seconds: 3600, source: 'Manual' as const }
    expect(stickerLines(run, 'km')).toEqual({ distance: '10 km', time: '1:00:00', pace: '6:00/km' })
    expect(stickerLines(run, 'mi')).toEqual({ distance: '6.2 mi', time: '1:00:00', pace: '9:39/mi' })
  })
  it('leaves unknown distance, duration and pace unknown', () => {
    expect(stickerLines({ date: '2026-10-28', title: 'Run', seconds: 2530, source: 'Manual' }, 'km')).toEqual({ distance: null, time: '42:10', pace: null })
    expect(stickerLines({ date: '2026-10-28', title: 'Run', distanceKm: 10, source: 'Strava' }, 'km')).toEqual({ distance: '10 km', time: null, pace: null })
  })
})

describe('Share Studio privacy and metric precision', () => {
  const run = { date: '2026-11-21', title: 'Morning run', source: 'Strava' as const,
    distanceKm: 5, seconds: 1495, elevationGainMetres: 32.7, averageHeartRate: 158, calories: 312 }
  it('does not include optional readings unless selected', () => {
    expect(stickerExtraLines(run)).toEqual([])
    expect(stickerExtraLines(run, { showElevation: true })).toEqual(['ELEVATION 33 m'])
    expect(stickerExtraLines(run, { showElevation: true, showHeartRate: true, showCalories: true }))
      .toEqual(['ELEVATION 33 m', 'AVG HR 158 bpm', 'CALORIES 312 kcal'])
  })
  it('never invents missing, invalid or nonfinite readings', () => {
    expect(stickerExtraLines({ ...run, elevationGainMetres: null, averageHeartRate: Number.NaN, calories: -2 },
      { showElevation: true, showHeartRate: true, showCalories: true })).toEqual([])
    expect(stickerExtraLines({ ...run, elevationGainMetres: 0 }, { showElevation: true })).toEqual(['ELEVATION 0 m'])
  })
})
