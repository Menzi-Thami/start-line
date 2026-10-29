import { useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { Avatar } from './Avatar'
import { prepareProfilePicture } from './profile-picture'

interface Props {
  name: string
  photo: string | null
  onChange: (photo: string | null) => void
}

/** Your picture in Account: initials until the runner adds one, and they can change or remove it at any time. */
export function PhotoPicker({ name, photo, onChange }: Props) {
  const auth = useAuth()
  const input = useRef<HTMLInputElement>(null)
  const saving = useRef(false)
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'saved' } | { kind: 'error'; message: string }>({ kind: 'idle' })

  const run = async (action: (token: string) => Promise<string | null>) => {
    if (saving.current) return
    saving.current = true
    setStatus({ kind: 'busy' })
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      onChange(await action(token))
      setStatus({ kind: 'saved' })
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'That picture didn’t save. Try another.' })
    } finally {
      saving.current = false
    }
  }

  const busy = status.kind === 'busy'
  return (
    <div className="photo-picker">
      <Avatar name={name} photo={photo} size={72} label={photo ? 'Your picture' : `Your initials, ${name}`} />
      <div className="photo-picker-actions">
        <label className={`button button-quiet${busy ? ' is-busy' : ''}`} aria-busy={busy}>
          {photo ? 'Change picture' : 'Add a picture'}
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="visually-hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void run(async (token) => (await api.me.setPhoto(token, await prepareProfilePicture(file))).dataUrl)
            }}
          />
        </label>
        {photo && (
          <button type="button" className="link-button" disabled={busy} onClick={() => void run(async (token) => (await api.me.removePhoto(token), null))}>
            Remove picture
          </button>
        )}
        <span aria-live="polite">
          {status.kind === 'saved' && <span className="chip chip-good pop-in">Saved</span>}
          {status.kind === 'error' && <span className="field-error">{status.message}</span>}
        </span>
      </div>
      <p className="field-help">Optional. Pictures are compressed to 24 KB or less. Replacing one removes the old picture. Without one, your initials show. Only you see it.</p>
    </div>
  )
}
