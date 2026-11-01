import { useEffect, useMemo, useState } from 'react'
import type { ActivitySummary } from '../../lib/types'
import { milestonesFromRuns } from './milestones'

/** A stand-alone share surface. The host Home integration waits until #151/#144 settle. */
export function MilestoneCards({ runs }: { runs: readonly ActivitySummary[] }) {
  const milestones = useMemo(() => milestonesFromRuns(runs), [runs])
  const [choice, setChoice] = useState('longest')
  const [includeName, setIncludeName] = useState(false)
  const [name, setName] = useState('')
  const [prepared, setPrepared] = useState<{ key: string; url: string; file: File } | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const selected = milestones.find(item => item.id === choice) ?? milestones[0]

  const cardKey = JSON.stringify([selected?.id, selected?.value, selected?.detail, includeName ? name : ''])
  const current = prepared?.key === cardKey ? prepared : null

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    let url: string | null = null
    import('./render-milestone').then(({ renderMilestoneCard }) =>
      renderMilestoneCard(selected, { displayName: includeName ? name : undefined })
    ).then(blob => {
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setPrepared({ key: cardKey, url, file: new File([blob], `taperday-${selected.id}.png`, { type: 'image/png' }) })
      setError('')
    }).catch(() => { if (!cancelled) setError('Could not prepare your card. Please try another browser.') })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
      setPrepared(null)
    }
  }, [selected, includeName, name, cardKey])

  if (!selected) return <p className="field-help">Add a recorded run to create a milestone card.</p>
  const share = async () => {
    if (!current) return
    try {
      if (navigator.canShare?.({ files: [current.file] }) && navigator.share) {
        await navigator.share({ files: [current.file], title: 'My Taperday milestone' })
        setMessage('Shared.')
      } else setError('File sharing is not supported here. Save the PNG instead.')
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) setError('Sharing failed. Try saving the PNG.')
    }
  }
  return <section className="section milestone-share" aria-labelledby="milestone-share-title">
    <h3 id="milestone-share-title">Share a running milestone</h3>
    <p className="field-help">Built only from runs currently visible in your account, not a verified all-time record.</p>
    <div className="field">
      <label htmlFor="milestone-choice">Choose a milestone</label>
      <select id="milestone-choice" value={selected.id} onChange={event => { setChoice(event.target.value); setMessage('') }}>
        {milestones.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
      </select>
    </div>
    <p><strong>{selected.value} {selected.unit}</strong> — {selected.detail}</p>
    <label className="field"><input type="checkbox" checked={includeName} onChange={event => setIncludeName(event.target.checked)} /> Add my name to the image (optional)</label>
    {includeName && <div className="field"><label htmlFor="milestone-display-name">Name on card</label><input id="milestone-display-name" value={name} maxLength={36} onChange={event => setName(event.target.value)} /></div>}
    {current ? <div>
      <img src={current.url} width={270} height={338} alt={`Preview of ${selected.title} milestone card`} style={{ width: 'min(100%,270px)', height: 'auto', borderRadius: 'var(--radius-md)' }} />
      <div className="submit-row">
        <a className="button button-quiet" href={current.url} download={current.file.name}>Save PNG</a>
        {typeof navigator.canShare === 'function' && navigator.canShare({ files: [current.file] }) && <button type="button" className="button" onClick={() => void share()}>Share image</button>}
      </div>
    </div> : <p role="status">Preparing image…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </section>
}
