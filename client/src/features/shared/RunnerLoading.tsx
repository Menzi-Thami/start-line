import type { ReactNode } from 'react'
import { Runner } from './Runner'
import './runner-loading.css'

interface Props {
  /** What is genuinely pending. A loading animation must never imply progress that hasn't happened. */
  label: string
  detail?: ReactNode
  /** In-page waits should not obscure the rest of the app or block navigation. */
  compact?: boolean
  /**
   * Shows the runner straight away. By default it fades in after a short pause (CSS only, space reserved), so a fast
   * load never flashes a loader. Nothing waits for it: the content replaces it the moment it arrives.
   */
  immediate?: boolean
  /** Retry, Back or Sign out. Kept outside the live region so the buttons are not read out as status. */
  actions?: ReactNode
}

/** Taperday's existing running cartoon, reused for honest, cancellable loading states. */
export function RunnerLoading({ label, detail, compact = false, immediate = false, actions }: Props) {
  const className = `runner-loading${compact ? ' runner-loading-compact' : ''}${immediate ? ' runner-loading-immediate' : ''}`
  return (
    <div className={className}>
      <div className="runner-loading-visual" aria-hidden="true">
        <span className="runner-loading-track" />
        <Runner pose="sprint" size={compact ? 36 : 54} />
      </div>
      <div className="runner-loading-copy">
        <div role="status" aria-live="polite" aria-atomic="true" aria-label={label}>
          <p className="runner-loading-label">{label}</p>
          {detail && <p className="field-help runner-loading-detail">{detail}</p>}
        </div>
        {actions && <div className="runner-loading-actions">{actions}</div>}
      </div>
    </div>
  )
}
