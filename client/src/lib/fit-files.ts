import { Unzip, UnzipInflate } from 'fflate'

/** The API reads activity files up to this size; anything bigger is turned away here, before it's sent. */
export const MAX_FIT_BYTES = 10 * 1024 * 1024

/** A .fit file found in what the runner picked, ready to send. */
export interface FitEntry {
  kind: 'fit'
  name: string
  file: File
}

/** Something picked (or inside a zip) that won't be sent, and why. */
export interface SkippedEntry {
  kind: 'skipped'
  name: string
  reason: 'too-big' | 'not-fit' | 'bad-zip'
}

export type FoundEntry = FitEntry | SkippedEntry

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path
const isFit = (name: string) => name.toLowerCase().endsWith('.fit')
const isZip = (name: string) => name.toLowerCase().endsWith('.zip')

/** Reads a file in chunks so a multi-gigabyte account export never sits in memory whole. */
async function* chunks(file: Blob): AsyncGenerator<Uint8Array> {
  if (typeof file.stream !== 'function') {
    yield new Uint8Array(await file.arrayBuffer())
    return
  }

  const reader = file.stream().getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    yield value
  }
}

function join(parts: Uint8Array[], size: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * Every .fit file in a zip, including zips inside it (a Garmin account export keeps its activities in a zip within the
 * zip). Unzipping happens here in the browser: the export can be gigabytes, far more than an upload should carry,
 * and only the .fit files are ever sent. Nothing here reads the FIT format itself; that stays on the server.
 */
async function* readZip(name: string, source: AsyncIterable<Uint8Array>): AsyncGenerator<FoundEntry> {
  const found: FoundEntry[] = []
  const nested: { name: string; bytes: Uint8Array }[] = []
  let broken = false
  // A download cut short ends mid-entry without an error: an entry that starts but never finishes means a damaged zip.
  let unfinished = 0

  const unzip = new Unzip((entry) => {
    const entryName = baseName(entry.name)
    const fit = isFit(entry.name)
    if (!fit && !isZip(entry.name)) return // not started, so never decompressed
    const parts: Uint8Array[] = []
    let size = 0
    let tooBig = false
    unfinished += 1
    entry.ondata = (error, data, final) => {
      if (error) {
        broken = true
        return
      }
      size += data.length
      if (fit && size > MAX_FIT_BYTES) tooBig = true
      else if (!tooBig) parts.push(data)
      if (!final) return
      unfinished -= 1
      if (fit) {
        found.push(tooBig ? { kind: 'skipped', name: entryName, reason: 'too-big' } : { kind: 'fit', name: entryName, file: new File([join(parts, size)], entryName) })
      } else {
        nested.push({ name: entryName, bytes: join(parts, size) })
      }
    }
    entry.start()
  })
  unzip.register(UnzipInflate)

  const drain = async function* (): AsyncGenerator<FoundEntry> {
    yield* found.splice(0)
    for (const inner of nested.splice(0)) {
      yield* readZip(inner.name, (async function* () {
        yield inner.bytes
      })())
    }
  }

  try {
    for await (const chunk of source) {
      unzip.push(chunk)
      yield* drain()
    }
    unzip.push(new Uint8Array(0), true)
  } catch {
    broken = true
  }
  yield* drain()
  if (broken || unfinished > 0) yield { kind: 'skipped', name, reason: 'bad-zip' }
}

/** Walks what the runner picked: .fit files as they are, zips opened, anything else noted and left out. */
export async function* findFitFiles(files: readonly File[]): AsyncGenerator<FoundEntry> {
  for (const file of files) {
    if (isZip(file.name)) {
      yield* readZip(file.name, chunks(file))
    } else if (!isFit(file.name)) {
      yield { kind: 'skipped', name: file.name, reason: 'not-fit' }
    } else if (file.size > MAX_FIT_BYTES) {
      yield { kind: 'skipped', name: file.name, reason: 'too-big' }
    } else {
      yield { kind: 'fit', name: file.name, file }
    }
  }
}
