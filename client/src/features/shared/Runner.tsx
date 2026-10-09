export type RunnerPose = 'sprint' | 'crouch' | 'sleep' | 'victory'

interface Props {
  pose: RunnerPose
  /** Height in pixels; the width follows the pose. */
  size?: number
  className?: string
}

/**
 * Taperday's runner: a stick figure in volt, drawn with strokes so it stays crisp at any size. Purely decorative
 * (always aria-hidden); the animations live in app.css (.runner-*), and stop for reduced motion with everything else.
 */
export function Runner({ pose, size = 34, className }: Props) {
  const common = {
    'aria-hidden': true,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: `runner runner-${pose}${className ? ` ${className}` : ''}`,
  }

  if (pose === 'crouch') {
    // On your marks: hands on the line, back knee down.
    return (
      <svg viewBox="0 0 80 60" width={(size * 80) / 60} height={size} {...common}>
        <circle cx="64" cy="22" r="7" fill="currentColor" stroke="none" />
        <path d="M58 28 L34 32" />
        <path d="M58 30 L63 56" />
        <path d="M34 32 L47 43 L41 56" />
        <path d="M34 32 L22 54 L9 56" />
      </svg>
    )
  }

  if (pose === 'sleep') {
    // Rest day: lying down with a pillow, breathing slowly.
    return (
      <svg viewBox="0 0 80 30" width={(size * 80) / 30} height={size} {...common}>
        <rect x="0" y="16" width="18" height="12" rx="5" fill="currentColor" opacity="0.35" stroke="none" />
        <g className="runner-breathe">
          <circle cx="12" cy="12" r="7" fill="currentColor" stroke="none" />
          <path d="M20 18 L52 20 L74 22" />
          <path d="M36 19 L48 12 L60 18" />
        </g>
      </svg>
    )
  }

  if (pose === 'victory') {
    // Race day: arms up.
    return (
      <svg viewBox="0 0 60 80" width={(size * 60) / 80} height={size} {...common}>
        <circle cx="30" cy="10" r="8" fill="currentColor" stroke="none" />
        <path d="M30 21 L30 46" />
        <path d="M30 26 L16 8" />
        <path d="M30 26 L44 8" />
        <path d="M30 46 L22 76" />
        <path d="M30 46 L38 76" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 60 80" width={(size * 60) / 80} height={size} {...common}>
      <circle cx="33" cy="10" r="8" fill="currentColor" stroke="none" />
      <path d="M32 21 L29 46" />
      <g className="limb arm-a">
        <path d="M31 24 L22 34 L28 42" />
      </g>
      <g className="limb arm-b">
        <path d="M31 24 L40 33 L47 28" />
      </g>
      <g className="limb leg-a">
        <path d="M30 46 L22 62 L28 76" />
      </g>
      <g className="limb leg-b">
        <path d="M30 46 L40 60 L34 76" />
      </g>
    </svg>
  )
}
