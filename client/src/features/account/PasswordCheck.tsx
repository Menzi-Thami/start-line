import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { Wordmark } from '../../app/Wordmark'
import { ThemeToggle } from '../../app/ThemeToggle'
import { ApiError, api } from '../../lib/api-client'
import { RunnerLoading } from '../shared/RunnerLoading'

type Result = { owner: string; message: string; runnerId?: string }

/** Opt-in provider check. Credentials stay with Microsoft; this page only reads the authenticated runner. */
export function PasswordCheck() {
  const auth = useAuth()
  const [result, setResult] = useState<Result | null>(null)
  const [work, setWork] = useState<{ owner: string; controller: AbortController } | null>(null)
  const inflight = useRef<AbortController | null>(null)
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => { inflight.current?.abort(); clearTimeout(deadline.current) }, [auth.account?.id, auth.sessionReady])
  const check = async () => {
    const owner = auth.account?.id
    if (!owner || !auth.sessionReady) return
    inflight.current?.abort()
    clearTimeout(deadline.current)
    const controller = new AbortController()
    inflight.current = controller
    setWork({ owner, controller })
    setResult(null)
    const timer = setTimeout(() => {
      if (inflight.current !== controller) return
      controller.abort()
      inflight.current = null
      setWork(null)
      setResult({ owner, message: 'The account check took too long. Try again.' })
    }, 30_000)
    deadline.current = timer
    try {
      const token = await auth.getToken()
      if (controller.signal.aborted) return
      if (!token) throw new ApiError('Continue securely with Microsoft, then try the check again.', 401)
      const runner = await api.me.get(token, controller.signal)
      if (!controller.signal.aborted) setResult({ owner, message: 'Your account is accessible.', runnerId: runner.id })
    } catch (error) {
      if (controller.signal.aborted) return
      setResult({ owner, message: error instanceof ApiError && error.code === 'registration_required'
        ? 'Microsoft sign-in succeeded. Finish setting up your profile in Taperday.'
        : error instanceof ApiError ? error.message : 'The account check did not finish. Try again.' })
    } finally {
      clearTimeout(timer)
      if (inflight.current === controller) { inflight.current = null; setWork(null) }
    }
  }
  const shown = auth.sessionReady && result?.owner === auth.account?.id ? result : null
  return <div className="page">
    <header className="masthead"><a className="wordmark" href="/"><Wordmark /></a></header>
    <ThemeToggle />
    <main id="main-content" className="sign-in-landing">
      <section className="sign-in-landing-card" aria-labelledby="password-check-title">
        <p className="sign-in-eyebrow">Account check</p>
        <h1 id="password-check-title">Password sign-in check</h1>
        {!auth.enabled ? <p>Password checks are not enabled on this site yet.</p> : <>
          <p>Use a dedicated test account. Microsoft handles sign-up, passwords and password reset on its own page.</p>
          <p className="field-help">Existing email-code accounts keep their current method. This check does not convert accounts or confirm that a password was used.</p>
          {auth.error && <p role="alert">{auth.error.message}</p>}
          {auth.loading ? <RunnerLoading label="Checking your session" compact /> : auth.account && auth.sessionReady ? <>
            <p>Signed in as {auth.account.name || 'your Microsoft account'}.</p>
            <div className="sign-in-actions">
              <button className="button button-primary" type="button" disabled={!auth.account.id || (work?.owner === auth.account.id && !work.controller.signal.aborted)} onClick={() => void check()}>Check account access</button>
              <button className="button button-quiet" type="button" onClick={auth.signOut}>Sign out</button>
            </div>
            {shown && <div role="status"><p>{shown.message}</p>{shown.runnerId && <p className="field-help">Runner ID: {shown.runnerId}</p>}</div>}
          </> : <div className="sign-in-actions">
            <button className="button button-primary" type="button" onClick={auth.signUp}>Create a test account</button>
            <button className="button button-quiet" type="button" onClick={auth.account ? auth.resumeSession ?? auth.signIn : auth.signIn}>Sign in</button>
            {auth.signInWithGoogle && <button className="button button-quiet" type="button" onClick={auth.signInWithGoogle}>Continue with Google</button>}
          </div>}
          <p className="field-help">For a password account, choose “Forgot password?” on Microsoft’s sign-in page to test recovery.</p>
        </>}
        <p><a href="/?view=sign-in">Continue to Taperday</a></p>
      </section>
    </main>
  </div>
}
