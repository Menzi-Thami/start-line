import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server'
import { BATCH_FILES, uploadAll } from './bulk-upload'
import type { BulkImportFile, ImportStatus } from './types'

const fit = (name: string, size = 100) => new File([new Uint8Array(size)], name)

/** A batch endpoint that answers per file; `statuses` picks the outcome for each file in order across all batches. */
function batchApi(statuses: (index: number) => ImportStatus = () => 'Imported') {
  const batches: number[] = []
  let index = 0
  server.use(
    http.post('*/api/v1/me/activities/batch', async ({ request }) => {
      // jsdom files lose their names on the way into undici, so the parts are counted, not read.
      const count = (await request.text()).split('name="files"').length - 1
      batches.push(count)
      const files: BulkImportFile[] = Array.from({ length: count }, () => {
        const status = statuses(index++)
        return { name: `file-${index}`, status, message: status === 'LimitReached' ? 'You can keep up to 1,000 runs.' : null, activity: null }
      })
      return HttpResponse.json({ files })
    }),
  )
  return batches
}

describe('uploading many runs', () => {
  it('sends at most twenty files a request, with a fresh token for each', async () => {
    const batches = batchApi()
    const getToken = vi.fn(() => Promise.resolve('token'))

    const result = await uploadAll(Array.from({ length: 45 }, (_, i) => fit(`${i}.fit`)), { getToken })

    expect(batches).toEqual([BATCH_FILES, BATCH_FILES, 5])
    expect(getToken).toHaveBeenCalledTimes(3)
    expect(result.outcomes.filter((o) => o.status === 'Imported')).toHaveLength(45)
    expect(result.stoppedBecause).toBeNull()
  })

  it('keeps each request under 20 MB', async () => {
    const batches = batchApi()
    const eightMb = 8 * 1024 * 1024

    await uploadAll([fit('a.fit', eightMb), fit('b.fit', eightMb), fit('c.fit', eightMb)], { getToken: () => Promise.resolve('t') })

    expect(batches).toEqual([2, 1])
  })

  it('stops at the run limit and sends nothing more', async () => {
    const batches = batchApi((i) => (i === 0 ? 'Imported' : 'LimitReached'))

    const result = await uploadAll(Array.from({ length: 25 }, (_, i) => fit(`${i}.fit`)), { getToken: () => Promise.resolve('t') })

    expect(batches).toEqual([20])
    expect(result.stoppedBecause).toBe('limit')
    expect(result.outcomes.filter((o) => o.status === 'NotSent')).toHaveLength(5)
  })

  it('stops at the rate limit with the API’s words on when to try again', async () => {
    server.use(http.post('*/api/v1/me/activities/batch', () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '120' } })))

    const result = await uploadAll([fit('a.fit'), fit('b.fit')], { getToken: () => Promise.resolve('t') })

    expect(result.stoppedBecause).toBe('rate-limit')
    expect(result.stopMessage).toMatch(/120 seconds/)
    expect(result.outcomes.map((o) => o.status)).toEqual(['NotSent', 'NotSent'])
  })

  it('stops when the runner presses Stop', async () => {
    batchApi()
    const controller = new AbortController()

    const result = await uploadAll(Array.from({ length: 30 }, (_, i) => fit(`${i}.fit`)), {
      getToken: () => Promise.resolve('t'),
      signal: controller.signal,
      onProgress: (progress) => progress.Imported === BATCH_FILES && controller.abort(),
    })

    expect(result.stoppedBecause).toBe('cancelled')
    expect(result.outcomes.filter((o) => o.status === 'Imported')).toHaveLength(BATCH_FILES)
    expect(result.outcomes.filter((o) => o.status === 'NotSent')).toHaveLength(10)
  })

  it('notes files it never sends', async () => {
    const batches = batchApi()

    const result = await uploadAll([new File(['x'], 'notes.txt'), fit('a.fit')], { getToken: () => Promise.resolve('t') })

    expect(batches).toEqual([1])
    expect(result.outcomes.map((o) => o.status)).toEqual(['NotFit', 'Imported'])
  })

  it('fails loudly on a server error rather than pretending it worked', async () => {
    server.use(http.post('*/api/v1/me/activities/batch', () => new HttpResponse(null, { status: 500 })))

    await expect(uploadAll([fit('a.fit')], { getToken: () => Promise.resolve('t') })).rejects.toThrow(/Something went wrong on our side/)
  })
})
