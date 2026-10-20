import { api, ApiError } from './api-client'
import { findFitFiles, type FitEntry } from './fit-files'
import type { BulkImportFile, ImportStatus } from './types'

/** The API takes up to 20 files and 25 MB a request; batches stay under both with room for the multipart envelope. */
export const BATCH_FILES = 20
export const BATCH_BYTES = 20 * 1024 * 1024

/** One line per file the runner sent or picked: what Taperday did with it. */
export interface FileOutcome {
  name: string
  status: ImportStatus | 'TooBig' | 'NotFit' | 'BadZip' | 'NotSent'
  message: string | null
  activityId: string | null
}

export type BulkProgress = Readonly<Record<FileOutcome['status'], number>>

export const emptyProgress = (): Record<FileOutcome['status'], number> => ({
  Imported: 0,
  AlreadyUploaded: 0,
  Skipped: 0,
  Unreadable: 0,
  LimitReached: 0,
  TooBig: 0,
  NotFit: 0,
  BadZip: 0,
  NotSent: 0,
})

export interface BulkResult {
  outcomes: FileOutcome[]
  /** Why it stopped early, if it did: the runner hit the run limit, the rate limit, or pressed Stop. */
  stoppedBecause: 'limit' | 'rate-limit' | 'cancelled' | null
  /** The API's own words when it stopped on an error, such as when to try again. */
  stopMessage: string | null
}

interface Options {
  getToken: () => Promise<string | null>
  signal?: AbortSignal
  onProgress?: (progress: BulkProgress, outcome: FileOutcome) => void
}

const fromApi = (r: BulkImportFile): FileOutcome => ({ name: r.name, status: r.status, message: r.message, activityId: r.activity?.id ?? null })

/**
 * Finds the .fit files in what the runner picked and sends them in batches. Each batch gets a fresh token, because a
 * full account export can take long enough for a sign-in to need refreshing. Stops at the run limit (everything after
 * would be turned away anyway), at the rate limit, or when the runner presses Stop.
 */
export async function uploadAll(picked: readonly File[], { getToken, signal, onProgress }: Options): Promise<BulkResult> {
  const outcomes: FileOutcome[] = []
  const progress = emptyProgress()
  const record = (outcome: FileOutcome) => {
    outcomes.push(outcome)
    progress[outcome.status] += 1
    onProgress?.({ ...progress }, outcome)
  }

  let batch: FitEntry[] = []
  let batchBytes = 0
  let stoppedBecause: BulkResult['stoppedBecause'] = null
  let stopMessage: string | null = null

  const send = async () => {
    if (batch.length === 0) return
    const sending = batch
    batch = []
    batchBytes = 0
    const token = await getToken()
    if (!token) throw new ApiError('Your sign-in has expired. Sign in again to carry on.', 401)
    try {
      const result = await api.me.uploadActivities(token, sending.map((e) => e.file), signal)
      for (const file of result.files) record(fromApi(file))
      if (result.files.some((f) => f.status === 'LimitReached')) stoppedBecause = 'limit'
    } catch (error) {
      if (signal?.aborted) {
        stoppedBecause = 'cancelled'
        for (const entry of sending) record({ name: entry.name, status: 'NotSent', message: null, activityId: null })
        return
      }
      if (error instanceof ApiError && error.status === 429) {
        stoppedBecause = 'rate-limit'
        stopMessage = error.message
        for (const entry of sending) record({ name: entry.name, status: 'NotSent', message: null, activityId: null })
        return
      }
      throw error
    }
  }

  for await (const entry of findFitFiles(picked)) {
    if (signal?.aborted && !stoppedBecause) stoppedBecause = 'cancelled'
    if (stoppedBecause) {
      if (entry.kind === 'fit') record({ name: entry.name, status: 'NotSent', message: null, activityId: null })
      continue
    }

    if (entry.kind === 'skipped') {
      record({ name: entry.name, status: entry.reason === 'too-big' ? 'TooBig' : entry.reason === 'not-fit' ? 'NotFit' : 'BadZip', message: null, activityId: null })
      continue
    }

    if (batch.length >= BATCH_FILES || (batch.length > 0 && batchBytes + entry.file.size > BATCH_BYTES)) await send()
    if (stoppedBecause) {
      record({ name: entry.name, status: 'NotSent', message: null, activityId: null })
      continue
    }
    batch.push(entry)
    batchBytes += entry.file.size
  }

  if (!stoppedBecause) await send()
  else for (const entry of batch) record({ name: entry.name, status: 'NotSent', message: null, activityId: null })

  return { outcomes, stoppedBecause, stopMessage }
}
