import { Runner } from './Runner'
import './runner-loading.css'

interface Props {
  /** What is genuinely pending. A loading animation must never imply progress that hasn't happened. */
  label: string
  detail?: string
  /** In-page waits should not obscure the rest of the app or block navigation. */
  compact?: boolean
}

/** Taperday's existing running cartoon, reused for honest, cancellable loading states. */
export function RunnerLoading({ label, detail, compact = false }: Props) {
  return (
    <div className={`runner-loading${compact ? ' runner-loading-compact' : ''}`} role="status" aria-live="polite" aria-label={label}>
      <div className="runner-loading-visual" aria-hidden="true">
        <span className="runner-loading-track" />
        <Runner pose="sprint" size={compact ? 36 : 54} />
      </div>
      <div className="runner-loading-copy">
        <p className="runner-loading-label">{label}</p>
        {detail && <p className="field-help runner-loading-detail">{detail}</p>}
      </div>
    </div>
  )
}
