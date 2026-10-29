import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { lastPlanRequest, server } from './server'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  lastPlanRequest.body = undefined
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterAll(() => server.close())
