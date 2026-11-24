import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { lastPlanRequest, server } from './server'
import { forgetSyncedRuns } from '../features/sync/useSyncedRuns'
import { forgetHomePlan } from '../features/runner-home/home-data'
import { forgetCalendarLink } from '../features/account/useCalendarLink'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  // In-memory, per-visit caches must not carry one test's runner into the next.
  forgetSyncedRuns()
  forgetHomePlan()
  forgetCalendarLink()
  server.resetHandlers()
  lastPlanRequest.body = undefined
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterAll(() => server.close())
