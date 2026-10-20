/**
 * Strava's own marks, used as its brand guidelines ask (developers.strava.com/guidelines): the official files,
 * unmodified, always smaller than Taperday's own name, and "View on Strava" for every link back to a synced run.
 */

/** The official "Connect with Strava" button (orange, 48 px high). It links to Strava's authorize page. */
export function ConnectWithStrava({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="strava-connect" onClick={onClick} disabled={disabled}>
      <img src="/strava/btn_strava_connect_with_orange.svg" width={237} height={48} alt="Connect with Strava" />
    </button>
  )
}

/** "Powered by Strava", beside data that came from Strava. White on the dark screen, black when printed. */
export function PoweredByStrava() {
  return (
    <span className="strava-powered">
      <img className="strava-powered-screen" src="/strava/api_logo_pwrdBy_strava_horiz_white.svg" width={110} height={11} alt="Powered by Strava" />
      <img className="strava-powered-print" src="/strava/api_logo_pwrdBy_strava_horiz_black.svg" width={110} height={11} alt="" aria-hidden="true" />
    </span>
  )
}

/** The link back to the original run on Strava, worded and styled as Strava's guidelines require. */
export function ViewOnStrava({ href }: { href: string }) {
  return (
    <a className="view-on-strava" href={href} target="_blank" rel="noopener noreferrer">
      View on Strava
    </a>
  )
}
