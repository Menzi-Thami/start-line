import { describe, expect, it } from 'vitest'
import { completedTasks, raceChecklistKey, RACE_TASKS } from './checklist'
describe('race week checklist', () => {
  it('scopes completion to race name and date', () => {
    expect(raceChecklistKey('2026-11-08', 'Cape Town')).not.toBe(raceChecklistKey('2026-11-15', 'Cape Town'))
    expect(raceChecklistKey('2026-11-08', 'Cape Town')).not.toBe(raceChecklistKey('2026-11-08', 'Another Race'))
  })
  it('ignores malformed, stale and unexpected checklist IDs', () => {
    expect(completedTasks('not json')).toEqual([])
    expect(completedTasks('{"start":true}')).toEqual([])
    expect(completedTasks('["start","start","unknown",9,"kit"]')).toEqual(['start','kit'])
    expect(RACE_TASKS.every(task => Boolean(task.id && task.label))).toBe(true)
  })
})
