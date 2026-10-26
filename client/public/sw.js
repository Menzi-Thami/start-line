// Taperday's service worker: the app's own files, so an installed Taperday opens fast and still opens with no signal.
// It keeps nothing of anyone's: the API and sign-in are on other hosts and pass straight through, never stored.
//
// - The page itself (any navigation): network first, so a new deploy always shows; the last good copy only when offline.
// - /assets/* (hashed, never change): cache first, kept after the first visit.
// - Everything else on this host (icons, the manifest): network, untouched.
//
// Reminders, if the runner turned them on in Account: a push carries the whole message ({ title, body, url, tag }), so
// showing it needs nothing fetched. A tap opens Taperday on today's run, and only ever a page of Taperday's own.
//
// "Ran it?" prompts (a run from Strava matched a planned session) also carry `tick`, a key for that one session. Where
// the browser shows buttons on a notification (Android, desktop Chrome and Edge), "Tick it" posts the key to the API
// named when the worker was registered (`sw.js?api=`), and nowhere else; on iPhone a tap opens the app, ready to tick.
// The key is never stored: it lives in the notification until it's tapped or dismissed.
//
// Bump VERSION to drop everything stored by an older worker.

const VERSION = 'taperday-v2'
const SHELL = '/'
const MAX_ASSETS = 60
const OPENS_AT = '/?view=home'
const API = apiOrigin(self.location.href)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.add(new Request(SHELL, { cache: 'reload' })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  // The API, sign-in and anything else elsewhere: not ours to keep.
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(fromNetworkThenShell(request))
    return
  }
  if (url.pathname.startsWith('/assets/')) event.respondWith(fromCacheThenNetwork(request))
})

async function fromNetworkThenShell(request) {
  try {
    const response = await fetch(request)
    // Only a good page replaces the copy kept for offline use (a redirected one can't be replayed for a navigation).
    if (response.ok && response.type === 'basic' && !response.redirected) {
      const cache = await caches.open(VERSION)
      await cache.put(SHELL, response.clone())
    }
    return response
  } catch (error) {
    const kept = await caches.match(SHELL)
    if (kept) return kept
    throw error
  }
}

async function fromCacheThenNetwork(request) {
  const cache = await caches.open(VERSION)
  const kept = await cache.match(request)
  if (kept) return kept
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    await cache.put(request, response.clone())
    await trim(cache)
  }
  return response
}

// Each deploy brings new hashed files; keep only the newest few dozen so storage never grows without end.
async function trim(cache) {
  const keys = (await cache.keys()).filter((key) => new URL(key.url).pathname.startsWith('/assets/'))
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)))
}

self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    // Not ours to read: still say something, as a push must show a notification.
  }
  const title = typeof message.title === 'string' && message.title ? message.title : 'Taperday'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof message.body === 'string' ? message.body : 'Open Taperday for today’s plan.',
      icon: '/home-icon-192.png',
      tag: typeof message.tag === 'string' ? message.tag : undefined,
      ...tickOptions(message),
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const url = pageOf(data.url)
  event.waitUntil(event.action === 'tick' && typeof data.tick === 'string' ? tick(data.tick, url, event.notification.tag) : openPage(url))
})

// What a notification carries: the page a tap opens and, on a "ran it?" prompt, its key and the "Tick it" button.
function tickOptions(message) {
  const url = pageOf(message.url)
  if (typeof message.tick !== 'string' || !message.tick) return { data: { url } }
  return { data: { url, tick: message.tick }, actions: [{ action: 'tick', title: 'Tick it' }] }
}

// Ticks the session straight from the notification, then says so. If that can't be done (offline, or the key has
// expired), the app opens on the session instead, so the runner can tick it there.
async function tick(token, url, tag) {
  try {
    const response = await fetch(`${API}/api/v1/ticks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!response.ok) return openPage(url)
    return self.registration.showNotification('Ticked off', {
      body: 'Open Taperday to say how it felt.',
      icon: '/home-icon-192.png',
      tag,
      data: { url },
    })
  } catch {
    return openPage(url)
  }
}

// The API's origin, from the worker's own address: an https origin, or this host when the API sits behind it.
function apiOrigin(href) {
  try {
    const named = new URL(href).searchParams.get('api')
    const api = named ? new URL(named) : null
    return api && (api.protocol === 'https:' || api.origin === self.location.origin) ? api.origin : self.location.origin
  } catch {
    return self.location.origin
  }
}

// Only a page on this host: a push can't send the runner anywhere else.
function pageOf(url) {
  if (typeof url !== 'string') return OPENS_AT
  try {
    const page = new URL(url, self.location.origin)
    return page.origin === self.location.origin ? page.pathname + page.search : OPENS_AT
  } catch {
    return OPENS_AT
  }
}

async function openPage(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
  if (open) {
    const focused = await open.focus()
    return (focused || open).navigate(url).catch(() => self.clients.openWindow(url))
  }
  return self.clients.openWindow(url)
}
