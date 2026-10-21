import { describe, expect, it } from 'vitest'
import { fromSearchParams, toRequest, toSearchParams, type PlanInputs } from './plan-url'

const custom: PlanInputs = {
  raceName: 'Parkrun PB',
  distanceKm: 5,
  raceDate: '2026-12-13',
  goalSeconds: 1470,
  runDays: ['Sunday', 'Tuesday', 'Thursday', 'Saturday'],
  longRunDay: 'Sunday',
  currentWeeklyKm: 25,
  experience: 'New',
  strengthDays: ['Monday'],
  planFrom: '2026-10-08',
}

describe('plan links', () => {
  it('round-trips every input through the URL', () => {
    const back = fromSearchParams(toSearchParams(custom))

    expect(back).toEqual({ ...custom, raceSlug: undefined, runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'] })
  })

  it('keeps links short and readable', () => {
    expect(toSearchParams(custom).toString()).toBe(
      'km=5&date=2026-12-13&name=Parkrun+PB&goal=1470&days=tu.th.sa.su&long=su&exp=new&now=25&gym=mo&from=2026-10-08',
    )
  })

  it('a catalogue race needs only its slug', () => {
    const params = toSearchParams({ ...custom, raceSlug: 'comrades-2027' })

    expect(params.has('km')).toBe(false)
    expect(fromSearchParams(params)?.raceSlug).toBe('comrades-2027')
  })

  it.each([
    ['no goal', 'race=x&days=tu.th.su&long=su'],
    ['too few days', 'race=x&goal=100&days=tu.su&long=su'],
    ['long run on a rest day', 'race=x&goal=100&days=tu.th.sa&long=su'],
    ['no race at all', 'goal=100&days=tu.th.su&long=su'],
    ['a garbled date', 'km=5&date=soon&goal=100&days=tu.th.su&long=su'],
  ])('ignores an incomplete link: %s', (_, query) => {
    expect(fromSearchParams(new URLSearchParams(query))).toBeNull()
  })

  it('drops unknown values instead of guessing', () => {
    const inputs = fromSearchParams(new URLSearchParams('race=x&goal=100&days=tu.th.su.zz&long=su&exp=elite&from=yesterday&gym=mo.tu.we.th'))

    expect(inputs?.runDays).toEqual(['Tuesday', 'Thursday', 'Sunday'])
    expect(inputs?.experience).toBe('Regular')
    expect(inputs?.planFrom).toBeUndefined()
    expect(inputs?.strengthDays).toHaveLength(3)
  })

  it('builds the API request with a .NET time span and no race fields for a catalogue race', () => {
    const request = toRequest({ ...custom, raceSlug: 'comrades-2027', goalSeconds: 37800 })

    expect(request).toMatchObject({ raceSlug: 'comrades-2027', distanceKm: null, raceDate: null, goalTime: '10:30:00' })
  })
})

describe('replanned plan links', () => {
  const replanned: PlanInputs = { ...custom, replan: { from: '2026-11-19', setback: 'Illness', recentWeeklyKm: 12 } }

  it('carry the replan as three short parameters', () => {
    expect(toSearchParams(replanned).toString()).toContain('from=2026-10-08&re=2026-11-19&why=ill&last=12')
    expect(fromSearchParams(toSearchParams(replanned))?.replan).toEqual(replanned.replan)
  })

  it('reach the API as a replan date, a setback and last week’s distance', () => {
    expect(toRequest(replanned)).toMatchObject({ planFrom: '2026-10-08', replanFrom: '2026-11-19', setback: 'Illness', recentWeeklyKm: 12 })
    expect(toRequest(custom)).toMatchObject({ replanFrom: null, setback: null, recentWeeklyKm: null })
  })

  it.each([
    ['an unknown reason', 're=2026-11-19&why=tired'],
    ['no date', 'why=ill'],
    ['a garbled date', 're=soon&why=ill'],
    ['behind without last week’s distance', 're=2026-11-19&why=behind'],
  ])('drop a replan with %s, but keep the plan', (_, replan) => {
    const inputs = fromSearchParams(new URLSearchParams(`${toSearchParams(custom)}&${replan}`))

    expect(inputs).not.toBeNull()
    expect(inputs?.replan).toBeUndefined()
  })
})
