import { useId, useState } from 'react'
import { useAuth } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { Runner } from '../../lib/types'
import { PRIVACY_CONTACT, PRIVACY_NOTICE_DATE } from './privacy-notice'

const POLICY_HREF = '/?view=privacy'

/** The short version, shown wherever a runner is asked to agree. The full policy is one link away. */
export function PrivacyNoticeSummary() {
  return (
    <>
      <ul>
        <li>Your name, email, time zone and the plans you save, so we can show your plans and send your weekly email.</li>
        <li>
          Your runs, from files you upload or from Strava if you connect it: distance, times, km splits and best efforts, so we can show
          how each run went against your plan. Never your route or GPS.
        </li>
        <li>Runs from Strava are kept for 7 days at a time and refreshed while you stay connected. Disconnecting deletes them.</li>
        <li>Heart rate only if you agree below. It’s health information, so it’s your choice.</li>
        <li>
          Reminders only if you turn them on in Account: your device’s push address, kept encrypted. They name the day’s session and nothing
          about your runs.
        </li>
        <li>Sign-in is handled by Microsoft, so we never see a password. We don’t sell your data, show ads or use AI.</li>
        <li>You can download everything we hold, or delete it all, from Account at any time.</li>
      </ul>
      <p className="field-help">
        <a href={POLICY_HREF} target="_blank" rel="noopener">
          Read the full privacy policy
        </a>{' '}
        (opens in a new tab).
      </p>
    </>
  )
}

interface ConsentFieldProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** True on the profile page, where unticking deletes heart rate already stored. */
  editing?: boolean
}

/** Heart rate is health information (POPIA special personal information), so it has its own, optional consent. */
export function HeartRateConsentField({ checked, onChange, editing = false }: ConsentFieldProps) {
  const id = useId()
  return (
    <div className="consent-field">
      <label className="session-done" style={{ color: 'var(--ink)' }} htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        Keep heart rate from my runs (optional)
      </label>
      <p className="field-help">
        Taperday uses it for heart-rate zones, drift and heart rate per km. Without it, your runs are kept with no heart rate at all.
        {editing && ' Untick it and we delete the heart rate we hold straight away.'}
      </p>
    </div>
  )
}

interface UpdateProps {
  runner: Runner
  onAccepted: (runner: Runner) => void
  onOpenAccount: () => void
}

/** For a runner who agreed to an older notice: nothing new is added until they read and accept this one. */
export function PrivacyUpdate({ runner, onAccepted, onOpenAccount }: UpdateProps) {
  const auth = useAuth()
  const [accepted, setAccepted] = useState(false)
  const [heartRate, setHeartRate] = useState(runner.heartRateConsent)
  const [status, setStatus] = useState<{ kind: 'idle' } | { kind: 'saving' } | { kind: 'error'; message: string }>({ kind: 'idle' })

  const accept = async () => {
    if (!accepted) {
      setStatus({ kind: 'error', message: 'Please read and accept the updated notice to carry on.' })
      return
    }
    setStatus({ kind: 'saving' })
    try {
      const token = await auth.getToken()
      if (!token) throw new Error('Your sign-in has expired. Sign in again to carry on.')
      onAccepted(await api.me.acceptPrivacy(token, { heartRateConsent: heartRate }))
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'That didn’t save. Try again.' })
    }
  }

  return (
    <section aria-labelledby="privacy-update-title">
      <p className="plan-kicker">Privacy · {PRIVACY_NOTICE_DATE}</p>
      <h2 className="plan-title" id="privacy-update-title">
        We’ve updated what we keep
      </h2>
      <p className="plan-focus">
        Taperday can now send reminders of your runs to your phone or computer, only if you turn them on. Have a read, then carry on where you
        left off.
      </p>
      <div className="panel notice">
        <h3>What we keep, and why</h3>
        <PrivacyNoticeSummary />
        <label className="session-done" style={{ color: 'var(--ink)' }}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          I’ve read this and I’m happy for Taperday to keep this information.
        </label>
        <HeartRateConsentField checked={heartRate} onChange={setHeartRate} />
        <div className="submit-row" style={{ marginTop: 'var(--space-4)' }}>
          <button type="button" className="button button-primary" disabled={status.kind === 'saving'} onClick={() => void accept()}>
            {status.kind === 'saving' ? 'Saving…' : 'Accept and carry on'}
          </button>
          <button type="button" className="link-button" onClick={onOpenAccount}>
            Download or delete my data instead
          </button>
        </div>
        {status.kind === 'error' && (
          <p className="field-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
            {status.message}
          </p>
        )}
      </div>
    </section>
  )
}

/** The full privacy policy: public, and the page Strava's API Policy (7.3) asks every connected app to publish. */
export function PrivacyPolicy() {
  const mail = <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>
  return (
    <article className="policy" aria-labelledby="policy-title">
      <p className="plan-kicker">Privacy · {PRIVACY_NOTICE_DATE}</p>
      <h2 className="plan-title" id="policy-title">
        Privacy policy
      </h2>
      <p className="plan-focus">
        Taperday builds free running plans and shows how your runs went against them. This page says what we keep, why, for how long,
        and what you can do about it. Questions or requests: {mail}.
      </p>

      <section className="section">
        <h3>Who’s responsible</h3>
        <p>
          Taperday (taperday.run) is run by {PRIVACY_CONTACT.name}, who is responsible for your information under South Africa’s
          Protection of Personal Information Act (POPIA). Contact: {mail}.
        </p>
      </section>

      <section className="section">
        <h3>What we keep, and why</h3>
        <ul>
          <li>
            <strong>Your account:</strong> your name, the email you sign in with, your time zone and units, whether you want the weekly
            email, your max heart rate if you add one, and which version of this notice you accepted and when. So we know who you are and
            can fit plans and emails to you.
          </li>
          <li>
            <strong>Your plans:</strong> the race, goal and days you chose, so we can show your plan again.
          </li>
          <li>
            <strong>Your runs:</strong> when you ran, distance, moving and elapsed time, pace, elevation, calories, km splits, best efforts
            and the plan session each run matched. So we can show how each run went against your plan.
          </li>
          <li>
            <strong>Heart rate, only if you agree:</strong> average and max, per km, time spent at each heart rate, and drift. It’s health
            information, so it’s asked for separately and is optional. Without it, runs are kept with no heart rate at all.
          </li>
          <li>
            <strong>Strava, if you connect it:</strong> your Strava athlete id, what you allowed us to read, and the access tokens, which
            are encrypted.
          </li>
          <li>
            <strong>Reminders, only if you turn them on:</strong> for each device you turn them on for, the push address and keys your
            browser gives us (encrypted, because with them anyone could send that device a notification), the time you chose, whether you
            want the Monday note, and the last day we sent one. So we can remind you of the day’s run, once, at your time.
          </li>
        </ul>
        <p>
          We never keep the files you upload, your route or GPS positions, or a password. Files are read once and thrown away, and
          locations are used only to measure distance.
        </p>
      </section>

      <section className="section">
        <h3>Where it comes from</h3>
        <p>
          From you, from the files you upload (Garmin .fit, GPX and TCX), and from Strava if you connect it. Connecting Strava fetches
          your runs from the last 6 weeks, then new ones as they arrive. Only runs are kept.
        </p>
      </section>

      <section className="section">
        <h3>How long we keep it</h3>
        <ul>
          <li>Your account and plans: until you delete them or your account.</li>
          <li>Runs you upload: until you delete them or your account (up to 1,000 runs).</li>
          <li>
            Reminders: until you turn them off on that device, the device’s browser ends its subscription, or you delete your account.
          </li>
          <li>
            Runs from Strava: 7 days at a time, refreshed while you stay connected, as Strava’s rules require. Disconnecting deletes them
            all, and we ask Strava to revoke our access.
          </li>
          <li>Technical logs (errors and request timings, which can include your IP address; never run data): 30 days.</li>
        </ul>
      </section>

      <section className="section">
        <h3>Who else is involved</h3>
        <ul>
          <li>Microsoft handles sign-in (Entra External ID) and hosts Taperday on Azure, in South Africa.</li>
          <li>Strava, only if you connect it, and only to read your own runs. Strava’s own privacy policy covers what it holds.</li>
          <li>
            Your browser’s push service, only if you turn reminders on: Google (Chrome, Edge on Android, Android), Apple (Safari, iPhone and
            iPad), Mozilla (Firefox) or Microsoft (Edge on Windows) carries each reminder to your device. A reminder says only the day’s session
            from your plan, such as “Easy run”, a good-luck note on race day, or that a new week has started. Never your runs, heart rate or
            anything from Strava.
          </li>
        </ul>
        <p>
          No one else. We don’t sell your information, show ads or use AI. Your runs are only ever shown to you, and your saved plans too unless you share a plan link yourself.
        </p>
      </section>

      <section className="section">
        <h3>On your device</h3>
        <p>
          Your browser keeps your sign-in for the session, and your unit choice and ticked sessions on your device. There are no tracking
          cookies.
        </p>
        <p>
          If you turn reminders on, your device shows them as notifications, which can appear on your lock screen. Turn them off in Account, or
          block notifications for Taperday in your browser or phone settings.
        </p>
        <p>
          Once you’re signed in, it also keeps a copy of your last Home (your name, current plan, recent runs, bests and whether Strava is
          connected, never your email or heart rate), so Home opens straight away next time. It’s cleared when you sign out, dropped
          after a week, and Strava runs in it go after seven days, as on Taperday itself.
        </p>
      </section>

      <section className="section">
        <h3>What you can do</h3>
        <ul>
          <li>Download everything we hold, from Account.</li>
          <li>Correct your details, from Account.</li>
          <li>Delete any run, or your whole account and everything in it, straight away.</li>
          <li>Withdraw heart-rate consent, from Account: we delete the heart rate we hold straight away.</li>
          <li>Disconnect Strava at any time.</li>
          <li>Turn reminders off at any time, from Account: we forget that device straight away.</li>
          <li>Ask us anything, or ask us to remove your Microsoft sign-in too: {mail}.</li>
          <li>
            If you’re not happy with how we handle your information, you can complain to South Africa’s Information Regulator
            (inforegulator.org.za).
          </li>
        </ul>
      </section>

      <section className="section">
        <h3>Keeping it safe</h3>
        <p>
          Everything travels encrypted, Strava tokens are encrypted at rest, and your information is stored in South Africa. Only you can
          see your runs, and your saved plans unless you share one.
        </p>
      </section>

      <section className="section">
        <h3>Changes</h3>
        <p>
          When this policy changes in a way that matters, we’ll ask you to read and accept it again before anything new is kept. This
          version is dated {PRIVACY_NOTICE_DATE}.
        </p>
      </section>
    </article>
  )
}
