import { describe, expect, it } from 'vitest'
import { fromRequest, fromSearchParams, toRequest, toSearchParams, type PlanInputs } from './plan-url'

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

describe('plan generator versions', () => {
  const v2: PlanInputs = { ...custom, version: 2 }

  it('a new plan carries its version as v; a plan from before versions has none, and stays version 1', () => {
    expect(toSearchParams(v2).toString()).toContain('from=2026-10-08&v=2')
    expect(fromSearchParams(toSearchParams(v2))?.version).toBe(2)
    expect(toSearchParams(custom).has('v')).toBe(false)
    expect(toSearchParams({ ...custom, version: 1 }).has('v')).toBe(false)
    expect(fromSearchParams(toSearchParams(custom))?.version).toBeUndefined()
  })

  it('reaches the API as the version, or none for version 1', () => {
    expect(toRequest(v2).version).toBe(2)
    expect(toRequest(custom).version).toBeNull()
  })

  it('keeps a saved plan’s version, and leaves version 1 out of its link', () => {
    expect(fromRequest({ ...toRequest(custom), version: 2 })?.version).toBe(2)
    expect(fromRequest({ ...toRequest(custom), version: 1 })?.version).toBeUndefined()
  })

  it('keeps a version this app doesn’t know yet, so the API can say the link is newer', () => {
    expect(fromSearchParams(new URLSearchParams(`${toSearchParams(custom)}&v=3`))?.version).toBe(3)
  })

  it.each(['two', '1.5', '-2', '0'])('drops a garbled version: %s', (value) => {
    expect(fromSearchParams(new URLSearchParams(`${toSearchParams(custom)}&v=${value}`))?.version).toBeUndefined()
  })
})

describe('a recent result', () => {
  const recent = { km: 10, seconds: 3000, date: '2026-10-01' }

  it('round-trips through the URL, the request and back', () => {
    const withRecent = { ...custom, recent }

    expect(fromSearchParams(toSearchParams(withRecent))?.recent).toEqual(recent)
    expect(toRequest(withRecent)).toMatchObject({ recentResultKm: 10, recentResultTime: '00:50:00', recentResultDate: '2026-10-01' })
    expect(fromRequest(toRequest(withRecent))?.recent).toEqual(recent)
  })

  it('adds three short parameters to a link and nothing without one', () => {
    expect(toSearchParams({ ...custom, recent }).toString()).toContain('rk=10&rt=3000&rd=2026-10-01')
    expect(toSearchParams(custom).has('rk')).toBe(false)
    expect(toRequest(custom)).toMatchObject({ recentResultKm: null, recentResultTime: null, recentResultDate: null })
  })

  it.each([
    ['no time', 'rk=10&rd=2026-10-01'],
    ['no distance', 'rt=3000&rd=2026-10-01'],
    ['no date', 'rk=10&rt=3000'],
    ['a garbled date', 'rk=10&rt=3000&rd=lastweek'],
    ['a negative time', 'rk=10&rt=-5&rd=2026-10-01'],
  ])('is dropped whole, not guessed at, with %s', (_, extra) => {
    const params = toSearchParams(custom)
    new URLSearchParams(extra).forEach((value, key) => params.set(key, value))

    expect(fromSearchParams(params)?.recent).toBeUndefined()
  })
})
