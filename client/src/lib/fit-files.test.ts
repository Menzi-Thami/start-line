import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { findFitFiles, MAX_FIT_BYTES, type FoundEntry } from './fit-files'

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill)

async function all(files: File[]): Promise<FoundEntry[]> {
  const found: FoundEntry[] = []
  for await (const entry of findFitFiles(files)) found.push(entry)
  return found
}

const summary = (found: FoundEntry[]) => found.map((e) => (e.kind === 'fit' ? `fit:${e.name}:${e.file.size}` : `skipped:${e.name}:${e.reason}`))

describe('finding .fit files in what the runner picked', () => {
  it('sends .fit files as they are and notes anything else', async () => {
    const found = await all([new File([bytes(100)], 'run.fit'), new File(['<gpx/>'], 'run.gpx'), new File([bytes(MAX_FIT_BYTES + 1)], 'huge.fit')])

    expect(summary(found)).toEqual(['fit:run.fit:100', 'skipped:run.gpx:not-fit', 'skipped:huge.fit:too-big'])
  })

  it('opens a Garmin account export, including the zip inside the zip, and keeps only the .fit files', async () => {
    const inner = zipSync({ 'user_1.fit': bytes(300, 1), 'user_2.FIT': bytes(200, 2), 'readme.txt': bytes(10) })
    const exported = zipSync({
      'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip': [inner, { level: 0 }],
      'DI_CONNECT/DI-Connect-Fitness/summary.json': bytes(50),
      'loose.fit': bytes(120, 3),
    })

    const found = await all([new File([exported], 'garmin-export.zip')])

    expect(summary(found).sort()).toEqual(['fit:loose.fit:120', 'fit:user_1.fit:300', 'fit:user_2.FIT:200'])
    const first = found.find((e) => e.kind === 'fit' && e.name === 'user_1.fit')
    expect(first?.kind === 'fit' && new Uint8Array(await first.file.arrayBuffer())[0]).toBe(1)
  })

  it('reads stored and deflated entries alike', async () => {
    const zip = zipSync({ 'a.fit': [bytes(64, 4), { level: 0 }], 'b.fit': [bytes(64, 5), { level: 9 }] })

    expect(summary(await all([new File([zip], 'export.zip')]))).toEqual(['fit:a.fit:64', 'fit:b.fit:64'])
  })

  it('turns away a .fit inside a zip that is too big to send', async () => {
    const zip = zipSync({ 'big.fit': bytes(MAX_FIT_BYTES + 10) })

    expect(summary(await all([new File([zip], 'export.zip')]))).toEqual(['skipped:big.fit:too-big'])
  })

  it('reports a zip cut short as damaged instead of failing', async () => {
    // Random bytes don't compress, so cutting the zip really cuts the file inside it.
    const zip = zipSync({ 'a.fit': crypto.getRandomValues(new Uint8Array(5000)) })

    const found = await all([new File([zip.slice(0, 2000)], 'broken.zip')])

    expect(summary(found)).toEqual(['skipped:broken.zip:bad-zip'])
  })
})
