import { onIos, runningInstalled } from './install-app'

/**
 * Web Push on this device, for reminders. Android and desktop browsers can take pushes in the browser itself; an iPhone
 * or iPad only once Taperday is on its home screen (iOS 16.4 and later), so there the answer is to add it first.
 */
export type PushSupport = 'supported' | 'home-screen-first' | 'unsupported'

export function pushSupport(): PushSupport {
  const capable = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (onIos() && !runningInstalled()) return 'home-screen-first'
  return capable ? 'supported' : 'unsupported'
}

/** Whether the runner has already said no to notifications for Taperday in this browser. */
export function notificationsBlocked(): boolean {
  return 'Notification' in window && Notification.permission === 'denied'
}

/** What the API needs to push to this device: the browser's push subscription, keys as base64url. */
export interface PushAddress {
  endpoint: string
  p256dh: string
  auth: string
}

/** Thrown with words a runner can act on. */
export class PushError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PushError'
  }
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function toBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** How the API knows this device among the runner's: SHA-256 of the endpoint, lower-case hex. Never the endpoint itself. */
export async function deviceKeyOf(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * The service worker that shows reminders. A built site registers it at start (`install-app.ts`); if that hasn't
 * happened yet it's registered here. The dev server has none, because the worker would keep the page.
 */
async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  if (import.meta.env.PROD) return navigator.serviceWorker.register('/sw.js')
  throw new PushError('Reminders work on the built site, where Taperday’s service worker runs.')
}

/** This device's push subscription, if the browser has one for Taperday. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  const existing = await navigator.serviceWorker.getRegistration()
  return existing ? existing.pushManager.getSubscription() : null
}

function sameKey(subscription: PushSubscription, publicKey: Uint8Array): boolean {
  const key = subscription.options?.applicationServerKey
  if (!key) return false
  const held = new Uint8Array(key)
  return held.length === publicKey.length && held.every((byte, i) => byte === publicKey[i])
}

/**
 * Asks for permission (the browser's own prompt), then subscribes this device with Taperday's public key. An existing
 * subscription for the same key is reused; one for an old key is replaced.
 */
export async function subscribe(publicKey: string): Promise<PushAddress> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new PushError(
      permission === 'denied'
        ? 'Notifications are blocked for Taperday. Allow them in your browser’s site settings, then turn reminders on.'
        : 'Reminders need your OK to show notifications. Turn them on again and choose Allow.',
    )
  }
  const key = fromBase64Url(publicKey)
  const pushManager = (await registration()).pushManager
  let subscription = await pushManager.getSubscription()
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  return addressOf(subscription)
}

export function addressOf(subscription: PushSubscription): PushAddress {
  return {
    endpoint: subscription.endpoint,
    p256dh: toBase64Url(subscription.getKey('p256dh')),
    auth: toBase64Url(subscription.getKey('auth')),
  }
}

/** Ends this device's push subscription, so its address stops working for anyone. A failure leaves nothing to undo. */
export async function unsubscribe(): Promise<void> {
  const subscription = await currentSubscription().catch(() => null)
  await subscription?.unsubscribe().catch(() => false)
}
