import { initialsOf } from './initials'

/**
 * The runner, as a circle: their own picture if they chose to add one, otherwise their initials in volt. Decorative next
 * to their name, so it's hidden from screen readers unless it stands alone (give it a label then).
 */
export function Avatar({ name, photo, size = 40, label }: { name: string; photo?: string | null; size?: number; label?: string }) {
  const common = { className: 'avatar', style: { width: size, height: size, fontSize: size * 0.4 }, ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }) }
  return photo ? (
    <span {...common}>
      <img src={photo} alt="" />
    </span>
  ) : (
    <span {...common}>{initialsOf(name) || '?'}</span>
  )
}
