import { useEffect, useState } from 'react'
import { downloadCard, prepareCard, shareCard, type CardContent } from './share-card'

export function AchievementShare({ card, text, fileName, kind = 'cabinet' }: { card: CardContent; text: string; fileName: string; kind?: 'cabinet' | 'race' }) {
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [prepared, setPrepared] = useState<{ key: string; file: File | null } | null>(null)
  const key = JSON.stringify({ card, fileName })
  const needsFile = typeof navigator.share === 'function'
  useEffect(() => {
    if (!needsFile) return
    let current = true
    prepareCard(card, fileName).then(file => { if (current) setPrepared({ key, file }) })
      .catch(() => { if (current) setPrepared({ key, file: null }) })
    return () => { current = false }
  }, [card, fileName, key, needsFile])
  return <div className="achievement-share">
    <div className="journey-actions">
      <button type="button" className="button button-primary" disabled={busy || (needsFile && prepared?.key !== key)} onClick={async () => {
        if (busy) return
        setBusy(true)
        try {
          const result = await shareCard(card, text, fileName, needsFile ? prepared?.file : null)
          setNotice(result === 'shared' ? 'Shared.' : result === 'copied' ? 'Copied to the clipboard.' : result === 'cancelled' ? null : 'Sharing isn’t available here. Save the card instead.')
        } finally { setBusy(false) }
      }}>{busy ? 'Sharing…' : kind === 'race' ? 'Share my race' : 'Share my cabinet'}</button>
      <button type="button" className="button button-quiet" onClick={async () => {
        try { const format = await downloadCard(card, fileName); setNotice(format === 'png' ? 'Card saved as a picture.' : 'Card saved as an SVG picture.') }
        catch { setNotice('The picture couldn’t be saved. Try sharing it instead.') }
      }}>{kind === 'race' ? 'Save race card' : 'Save cabinet card'}</button>
    </div>
    <p className="field-help">Portrait picture · 1080 × 1920 · ready for Stories or WhatsApp</p>
    {notice && <p className="field-help" role="status">{notice}</p>}
  </div>
}
