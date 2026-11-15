import { describe, expect, it } from 'vitest'
import { raceResult } from './journey-fixtures'
import { raceMemory } from './race-history-fixtures'
import { personalBests } from './race-history-model'
import { cardSvg } from './share-card'

describe('honest race history and exports', () => {
  it('compares chip times at the advertised event distance, excluding faster GPS recordings, DNFs and missing times', () => {
    const official = raceMemory({ result: raceResult({ id: 'official', finishTime: '04:00:00', distanceKm: 42.5, timeKind: 'OfficialChip' }) })
    const recording = raceMemory({ result: raceResult({ id: 'recording', finishTime: '03:10:00', timeKind: 'RecordedElapsed' }) })
    const unspecified = raceMemory({ result: raceResult({ id: 'unknown', finishTime: '03:00:00' }) })
    const dnf = raceMemory({ result: raceResult({ id: 'dnf', outcome: 'DidNotFinish', finishTime: '02:00:00', timeKind: 'OfficialChip' }) })
    const noTime = raceMemory({ result: raceResult({ id: 'no-time', finishTime: null, timeKind: 'OfficialChip' }) })
    expect([...personalBests([recording, official, unspecified, dnf, noTime])]).toEqual(['official'])
  })

  it('exports an escaped portrait cabinet with distinct earned and unearned medals', () => {
    const svg = cardSvg({ kicker: 'My cabinet', heading: 'EARNED IN MILES.', raceName: 'My Majors collection', stats: [{ value: '1/2', label: 'Major events finished' }],
      medals: [{ label: 'London', earned: true }, { label: '<Sydney & friends>', earned: false }], footer: 'My personal collection' })
    expect(svg).toContain('width="1080" height="1920"')
    expect(svg).toContain('FINISHED')
    expect(svg).toContain('STILL TO COME')
    expect(svg).toContain('&lt;Sydney &amp;')
    expect(svg).not.toContain('<Sydney')
  })
})
