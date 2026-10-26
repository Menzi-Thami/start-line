import { useEffect, useState } from 'react'
import { apiOrigin } from './api-client'

/**
 * Taperday as an app on the home screen. Android and desktop Chrome and Edge offer a one-tap install (the
 * `beforeinstallprompt` event, kept here so it's never missed); an iPhone or iPad can only add it from Safari's Share
 * menu, so it gets the two steps; anywhere else gets the browser's own menu. Once installed it opens full screen, and
 * nothing here shows.
 */
export type InstallWay = { kind: 'installed' } | { kind: 'prompt'; install: () => Promise<boolean> } | { kind: 'ios' } | { kind: 'menu' }

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let offer: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((listener) => listener())

/**
 * The service worker's address. It names the API, the one place its "Tick it" button may post a notification's key to,
 * since the worker can't read the build's settings itself.
 */
export const serviceWorkerUrl = (): string => `/sw.js?api=${encodeURIComponent(apiOrigin())}`

/** Starts listening for the browser's install offer, and registers the service worker in a built site. Called once, at start. */
export function setUpInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Held for our own button instead of the browser's mini bar, so the runner chooses when.
    event.preventDefault()
    offer = event as InstallPromptEvent
    changed()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    offer = null
    changed()
    // Where notifications are already allowed (Android, after installing from our button), say hello straight away.
    if ('Notification' in window && Notification.permission === 'granted') void showWelcomeNotification()
  })
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    // A failed registration changes nothing: the site works exactly as it would without one.
    window.addEventListener('load', () => void navigator.serviceWorker.register(serviceWorkerUrl()).catch(() => undefined))
  }
}

const WELCOMED_KEY = 'taperday:welcome-notified'

/**
 * The one-off "Taperday is on your home screen" notification, shown by this device's service worker (no server push
 * needed). Once per device; quietly does nothing where notifications aren't allowed or there's no service worker.
 */
export async function showWelcomeNotification(): Promise<boolean> {
  try {
    if (window.localStorage.getItem(WELCOMED_KEY)) return false
    if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return false
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification('Taperday is on your home screen', {
      body: 'Tap the icon any time for today’s run. Your reminders and run check-ins will come here too.',
      icon: '/home-icon-192.png',
      tag: 'taperday-welcome',
      data: { url: '/' },
    })
    window.localStorage.setItem(WELCOMED_KEY, new Date().toISOString())
    return true
  } catch {
    return false
  }
}

/** Already running from the home screen: opened full screen, or added from Safari. */
export function runningInstalled(): boolean {
  const standalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** An iPhone or iPad, including an iPad that says it's a Mac. */
export function onIos(): boolean {
  const agent = navigator.userAgent
  return /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)
}

function currentWay(): InstallWay {
  if (installed || runningInstalled()) return { kind: 'installed' }
  if (offer) {
    const held = offer
    return {
      kind: 'prompt',
      install: async () => {
        await held.prompt()
        const { outcome } = await held.userChoice
        // The browser's offer can be used once; whatever the answer, it's spent.
        offer = null
        if (outcome === 'accepted') installed = true
        changed()
        return outcome === 'accepted'
      },
    }
  }
  return onIos() ? { kind: 'ios' } : { kind: 'menu' }
}

/** How this device can add Taperday to its home screen, kept current as the browser's offer arrives or is used. */
export function useInstallWay(): InstallWay {
  const [way, setWay] = useState(currentWay)
  useEffect(() => {
    const update = () => setWay(currentWay())
    listeners.add(update)
    update()
    return () => {
      listeners.delete(update)
    }
  }, [])
  return way
}
