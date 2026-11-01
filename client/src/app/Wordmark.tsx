/**
 * The Taperday logo (docs/brand.md): "taper" steps down letter by letter, like a taper; "day" comes back full size, and
 * the green runner peeks out from behind it, leaning right. The runner rises once as the page loads, then rests.
 * Screen readers get the plain name; the letters and the runner are decoration.
 */
export function Wordmark() {
  return (
    <>
      <span className="visually-hidden">Taperday</span>
      <span className="wordmark-letters" aria-hidden="true">
        <span className="wl wl-1">t</span>
        <span className="wl wl-2">a</span>
        <span className="wl wl-3">p</span>
        <span className="wl wl-4">e</span>
        <span className="wl wl-5">r</span>
        <span className="wordmark-accent">day</span>
        <span className="wordmark-peek">
          <PeekingRunner />
        </span>
      </span>
    </>
  )
}

/** The runner from the emails' mascot: a sage head, eyes with a glint, a smile and four motion lines. */
function PeekingRunner() {
  return (
    <svg viewBox="-66 -46 132 92" focusable="false">
      <g className="wordmark-peek-lines" strokeLinecap="round" strokeWidth="4.5" fill="none">
        <path d="M-50 -30 L-58 -38" />
        <path d="M-54 -16 L-65 -18" />
        <path d="M50 -30 L58 -38" />
        <path d="M54 -16 L65 -18" />
      </g>
      <circle className="wordmark-peek-head" r="38" />
      <g className="wordmark-peek-face">
        <circle cx="-14" cy="-12" r="5.5" />
        <circle cx="14" cy="-12" r="5.5" />
        <path d="M-16 3 Q0 18 16 3" fill="none" strokeWidth="5" strokeLinecap="round" />
      </g>
      <circle cx="-12" cy="-13.5" r="1.8" fill="#ffffff" />
      <circle cx="16" cy="-13.5" r="1.8" fill="#ffffff" />
    </svg>
  )
}
