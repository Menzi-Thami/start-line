import { useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'

/** "Send feedback": a short note to Taperday's maker, with the page it came from. Signed-in runners only. */
export function FeedbackBox({ page }: { page: string }) {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const send = async () => {
    setStatus('sending')
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('signed out')
      await api.me.sendFeedback(token, message.trim(), page)
      setMessage('')
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setOpen(true)
          setStatus('idle')
        }}
      >
        Send feedback
      </button>
    )
  }
  return (
    <form
      className="feedback-box"
      onSubmit={(e) => {
        e.preventDefault()
        if (message.trim()) void send()
      }}
    >
      <label htmlFor="feedback-message">What would make Taperday better for you?</label>
      <textarea id="feedback-message" className="input" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="submit-row">
        <button type="submit" className="button" disabled={status === 'sending' || !message.trim()} aria-busy={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send'}
        </button>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>
          Close
        </button>
        <span aria-live="polite">
          {status === 'sent' && <span className="chip chip-good pop-in">Thanks, sent</span>}
          {status === 'error' && <span className="field-error">That didn’t send. Try again.</span>}
        </span>
      </div>
    </form>
  )
}
