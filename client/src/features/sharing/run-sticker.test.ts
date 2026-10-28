import { describe, expect, it } from 'vitest'
import { stickerLines } from './run-sticker'

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
