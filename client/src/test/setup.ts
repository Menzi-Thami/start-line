import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { lastPlanRequest, server } from './server'

// jsdom has dialog elements but no modal/top-layer implementation. Browser journeys verify
// native focus containment, inert background, Escape and return focus in Chromium.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  lastPlanRequest.body = undefined
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterAll(() => server.close())
