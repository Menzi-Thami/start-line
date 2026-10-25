// Taperday's service worker: the app's own files, so an installed Taperday opens fast and still opens with no signal.
// It keeps nothing of anyone's: the API and sign-in are on other hosts and pass straight through, never stored.
//
// - The page itself (any navigation): network first, so a new deploy always shows; the last good copy only when offline.
// - /assets/* (hashed, never change): cache first, kept after the first visit.
// - Everything else on this host (icons, the manifest): network, untouched.
//
// Bump VERSION to drop everything stored by an older worker.

const VERSION = 'taperday-v1'
const SHELL = '/'
const MAX_ASSETS = 60

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
