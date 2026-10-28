import { useEffect, useId, useRef, useState } from 'react'
import type { Units } from '../../lib/format'
import { STICKER_LAYOUTS, type StickerLayout } from './sticker-layouts'
import type { StickerRun } from './run-sticker'

/** Prepare the PNG before the tap so Safari keeps the user gesture for file sharing and clipboard access. */
export function RunSticker({ run, units }: { run: StickerRun; units: Units }) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [layout, setLayout] = useState<StickerLayout>('portrait')
  const [open, setOpen] = useState(false)
  const [prepared, setPrepared] = useState<{ key: string; file: File; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const size = STICKER_LAYOUTS.find((option) => option.id === layout)!
  const key = JSON.stringify([run, units, layout])
  const current = prepared?.key === key ? prepared : null
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    let url: string | null = null
    const details = JSON.parse(key)[0] as StickerRun
    import('./run-sticker')
      .then(({ renderRunSticker }) => renderRunSticker(details, units, layout))
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        setPrepared({ key, file: new File([blob], `taperday-run-${details.date}-${layout}.png`, { type: 'image/png' }), url })
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not create your sticker. Try again.')
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [open, key, units, layout])
  const close = () => {
    setOpen(false)
    setPrepared(null)
    setMessage(null)
    setError(null)
    triggerRef.current?.focus()
  }
  const share = async () => {
    if (!current) return
    setMessage(null)
    setError(null)
    try {
      await navigator.share({ files: [current.file] })
      setMessage('Sticker shared.')
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError('Sharing was unavailable. Use Save PNG instead.')
    }
  }
  const copy = async () => {
    if (!current) return
    setMessage(null)
    setError(null)
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': current.file })])
      setMessage('Sticker copied. Paste it into an app that accepts images.')
    } catch {
      setError('Copying was unavailable. Use Save PNG instead.')
    }
  }
  return (
    <div className="run-sticker">
      <button ref={triggerRef} type="button" className="link-button" onClick={() => setOpen(true)}>
        Share run sticker
      </button>
      {open && (
        <section
          className="sticker-panel"
          aria-labelledby={titleId}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              close()
            }
          }}
        >
          <div className="sticker-panel-head">
            <h3 id={titleId}>Your miles. Your story.</h3>
            <button ref={closeRef} type="button" className="button button-quiet" onClick={close}>
              Close sticker
            </button>
          </div>
          <p className="field-help">A transparent sticker for your photo or Instagram Story. Only your completed run is included.</p>
          <fieldset className="field sticker-layouts">
            <legend className="field-label">Sticker layout</legend>
            <div className="pills">
              {STICKER_LAYOUTS.map((option) => (
                <label className="pill" key={option.id}>
                  <input
                    type="radio"
                    name={`${titleId}-layout`}
                    value={option.id}
                    checked={layout === option.id}
                    onChange={() => {
                      setLayout(option.id)
                      setError(null)
                      setMessage(null)
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <p className="field-help">{size.description}</p>
          </fieldset>
          {current ? (
            <>
              <div className={`sticker-preview sticker-preview-${layout}`}>
                <img
                  src={current.url}
                  width={size.width}
                  height={size.height}
                  alt={`${size.label} Taperday sticker for ${run.title} on ${run.date}`}
                />
              </div>
              <div className="submit-row">
                {typeof navigator.canShare === 'function' && navigator.canShare({ files: [current.file] }) && (
                  <button type="button" className="button" onClick={() => void share()}>
                    Share sticker
                  </button>
                )}
                {typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function' && (
                  <button type="button" className="button button-quiet" onClick={() => void copy()}>
                    Copy sticker
                  </button>
                )}
                <a className="button button-quiet" href={current.url} target="_blank" rel="noopener noreferrer">
                  View full size
                </a>
                <a className="button button-quiet" href={current.url} download={current.file.name}>
                  Save PNG
                </a>
              </div>
              <p className="field-help">
                Save the PNG, then add it as a photo sticker in Instagram Stories. Available sharing apps and image pasting depend on your
                device.
              </p>
            </>
          ) : (
            !error && <p role="status">Creating your sticker…</p>
          )}
          {message && <p role="status">{message}</p>}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
