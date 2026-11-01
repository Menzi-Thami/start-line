import { useEffect, useId, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { Activity, Shoe } from '../../lib/types'

/** Which pair this run was worn in. Changing it moves the run's kilometres to that pair (or off every pair). */
export function ShoePicker({ run }: { run: Activity }) {
  const auth = useAuth()
  const id = useId()
  const [shoes, setShoes] = useState<Shoe[] | null>(null)
  const [worn, setWorn] = useState<string>(run.shoe?.id ?? '')
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    auth.getToken()
      .then((token) => (token ? api.me.shoes(token) : []))
      // Anything but a list (an older API, a proxy page) means no shoes to offer, never a crash of the run page.
      .then((list) => !cancelled && setShoes(Array.isArray(list) ? list : []))
      .catch(() => !cancelled && setShoes([]))
    return () => {
      cancelled = true
    }
  }, [auth])

  if (shoes === null) return null
  // Retired pairs stay listed only when this run is already on one.
  const choices = shoes.filter((s) => !s.retired || s.id === worn)
  if (choices.length === 0) {
    return <p className="field-help shoe-picker">Add your shoes in Account › Shoes to count their kilometres.</p>
  }

  const change = async (shoeId: string) => {
    const before = worn
    setWorn(shoeId)
    setSaving(true)
    setStatus(null)
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Sign in again to carry on.')
      await api.me.wearShoe(token, shoeId || null, { activityId: run.id })
      setStatus({ text: shoeId ? `Saved: worn in ${choices.find((s) => s.id === shoeId)?.name}.` : 'Saved: not on any pair.' })
    } catch (error) {
      setWorn(before)
      setStatus({ text: error instanceof Error ? error.message : 'That didn’t save. Try again.', error: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="shoe-picker">
      <label className="field" htmlFor={id}>
        <span className="field-label">Shoes</span>
        <select id={id} className="input" value={worn} disabled={saving} onChange={(e) => void change(e.target.value)}>
          <option value="">Not on a pair</option>
          {choices.map((s) => <option key={s.id} value={s.id}>{s.name}{s.retired ? ' (retired)' : ''}</option>)}
        </select>
      </label>
      {status && <p className={status.error ? 'field-error' : 'field-help'} role={status.error ? 'alert' : 'status'}>{status.text}</p>}
    </div>
  )
}
