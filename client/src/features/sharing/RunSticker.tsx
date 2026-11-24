import { useEffect, useId, useRef, useState } from 'react'
import type { Units } from '../../lib/format'
import { STICKER_LAYOUTS, type StickerLayout } from './sticker-layouts'
import type { StickerRun } from './run-sticker'

/** Prepare the PNG before the tap so Safari keeps the user gesture for file sharing and clipboard access. */
export function RunSticker({ run, units, prominent = false }: { run: StickerRun; units: Units; /** A full button, for a run just finished. */ prominent?: boolean }) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [layout, setLayout] = useState<StickerLayout>('portrait')
  const [open, setOpen] = useState(false)
  const [showElevation, setShowElevation] = useState(true)
  const [showHeartRate, setShowHeartRate] = useState(false)
  const [showCalories, setShowCalories] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [previewSurface, setPreviewSurface] = useState<'bright' | 'dark'>('bright')
  const [position, setPosition] = useState<'top' | 'middle' | 'bottom'>('top')
  const [prepared, setPrepared] = useState<{ key: string; file: File; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const size = STICKER_LAYOUTS.find((option) => option.id === layout)!
  const canUsePhoto = layout === 'story' || layout === 'square'
  const key = JSON.stringify([run, units, layout, position, showElevation, showHeartRate, showCalories,
    canUsePhoto && photo ? [photo.name, photo.size, photo.lastModified] : null])
  const current = prepared?.key === key ? prepared : null
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    const flags = { cancelled: false }
    let url: string | null = null
    const details = JSON.parse(key)[0] as StickerRun
    import('./run-sticker')
      .then(({ renderRunSticker }) => renderRunSticker(details, units, layout, {
        showElevation, showHeartRate, showCalories, photo: canUsePhoto ? photo : null, position,
      }))
      .then((blob) => {
        if (flags.cancelled) return
        url = URL.createObjectURL(blob)
        setPrepared({ key, file: new File([blob], `taperday-run-${details.date}-${layout}.png`, { type: 'image/png' }), url })
      })
      .catch((e: unknown) => {
        if (!flags.cancelled) setError(e instanceof Error ? e.message : 'Could not create your sticker. Try again.')
      })
    return () => {
      flags.cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [open, key, units, layout, position, showElevation, showHeartRate, showCalories, photo, canUsePhoto])
  const close = () => {
    setOpen(false)
    setPrepared(null)
    setPhoto(null)
    setMessage(null)
    setError(null)
    triggerRef.current?.focus()
  }
  const share = async () => {
    if (!current) return
    setMessage(null)
    setError(null)
    try {
      await navigator.share({ files: [current.file], title: 'My Taperday run', text: 'Made with Taperday — https://taperday.run' })
      setMessage('Sticker shared.')
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError('Sharing was unavailable. Use Save PNG instead.')
    }
  }
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText('https://taperday.run')
      setMessage('Taperday link copied. Add it to your Instagram Link sticker or social post.')
      setError(null)
    } catch {
      setError('Could not copy the link. You can use https://taperday.run instead.')
    }
  }
  const choosePhoto = (file: File | null) => {
    if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024)) {
      setError('Choose a JPEG, PNG or WebP photo smaller than 12 MB.')
      return
    }
    setPhoto(file)
    setError(null)
    setMessage(null)
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
      <button ref={triggerRef} type="button" className={prominent ? 'button button-primary' : 'link-button'} onClick={() => setOpen(true)}>
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
          <p className="field-help">Share your real run, your way. Dark contrast panels keep every number readable over photos and moving video. Photos stay on your device.</p>
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
          {(run.elevationGainMetres != null || run.averageHeartRate != null || run.calories != null) && (
            <fieldset className="field sticker-metrics">
              <legend className="field-label">Extra stats (optional)</legend>
              {run.elevationGainMetres != null && Number.isFinite(run.elevationGainMetres) && run.elevationGainMetres >= 0 && (
                <label><input type="checkbox" checked={showElevation} onChange={(e) => setShowElevation(e.target.checked)} /> Elevation gain</label>
              )}
              {run.averageHeartRate != null && Number.isFinite(run.averageHeartRate) && run.averageHeartRate > 0 && (
                <label><input type="checkbox" checked={showHeartRate} onChange={(e) => setShowHeartRate(e.target.checked)} /> Average heart rate (private until selected)</label>
              )}
              {run.calories != null && Number.isFinite(run.calories) && run.calories > 0 && (
                <label><input type="checkbox" checked={showCalories} onChange={(e) => setShowCalories(e.target.checked)} /> Calories</label>
              )}
            </fieldset>
          )}
          {layout === 'story' && (
            <fieldset className="field sticker-position">
              <legend className="field-label">Position stats over your Story</legend>
              <div className="pills">
                {(['top', 'middle', 'bottom'] as const).map((place) => (
                  <label className="pill" key={place}>
                    <input type="radio" name={titleId + '-position'} checked={position === place} onChange={() => setPosition(place)} />
                    {place === 'top' ? 'Top' : place === 'middle' ? 'Centre' : 'Bottom'}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {canUsePhoto && (
            <div className="field sticker-photo">
              <label htmlFor={titleId + '-photo'} className="field-label">Your photo (optional)</label>
              <input id={titleId + '-photo'} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => choosePhoto(e.target.files?.[0] ?? null)} />
              {photo && <button type="button" className="link-button" onClick={() => setPhoto(null)}>Remove photo</button>}
              <p className="field-help">{photo ? 'Photo added. Your exported image includes it.' : 'Without a photo, export a transparent sticker to add over a video or photo in another app.'}</p>
            </div>
          )}
          {(layout === 'transparent' || (canUsePhoto && !photo)) && (
            <div className="sticker-preview-controls" role="group" aria-label="Test sticker contrast">
              <span className="field-label">Preview against</span>
              <button type="button" className="button button-quiet" aria-pressed={previewSurface === 'bright'} onClick={() => setPreviewSurface('bright')}>Bright scene</button>
              <button type="button" className="button button-quiet" aria-pressed={previewSurface === 'dark'} onClick={() => setPreviewSurface('dark')}>Dark scene</button>
            </div>
          )}
          {current ? (
            <>
              <div className={`sticker-preview sticker-preview-${layout} sticker-scene-${previewSurface}`}>
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
                {typeof navigator.clipboard?.writeText === 'function' && (
                  <button type="button" className="button button-quiet" onClick={() => void copyLink()}>
                    Copy Taperday link
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
                For videos, save the transparent PNG and add it in your video editor. A picture cannot contain a clickable link:
                add https://taperday.run separately using the platform’s Link sticker. This is the Taperday homepage,
                not a public page exposing your run. Sharing availability depends on your device.
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
