import type { CSSProperties } from 'react'
import { Avatar } from '../features/account/Avatar'

export type TabBarItem = 'home' | 'plan' | 'runs' | 'progress' | 'account'

interface Props {
  current: TabBarItem | null
  onPick: (item: TabBarItem) => void
  /** The runner, for the Account item: their picture or initials in place of the icon. */
  account?: { name: string; photo: string | null }
  /** 'bar' sits along the bottom on phones and tablets; 'rail' stands down the left of a desktop screen. */
  variant?: 'bar' | 'rail'
  /** Without a plan there's nothing for Plan or Progress to show, so the bar leaves them out. */
  hasPlan?: boolean
}

const ICONS: Record<TabBarItem, string> = {
  home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  plan: 'M5 5h14v15H5zM5 9h14M9 3v4M15 3v4M8 13h3M8 16h6',
  runs: 'M13 4.5a1.5 1.5 0 1 0 0-.01M10 21l2-6 3 3v3M7 12l3-3 3 1 2 3h3M12 15l-2-3',
  progress: 'M4 20V11M10 20V5M16 20v-6M3 20h18',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5',
}

const ITEMS: readonly { id: TabBarItem; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'plan', label: 'Plan' },
  { id: 'runs', label: 'Runs' },
  { id: 'progress', label: 'Progress' },
  { id: 'account', label: 'Account' },
]

const NEEDS_PLAN: readonly TabBarItem[] = ['plan', 'progress']

/**
 * The app's own navigation: the same places in the same order on every screen size (five with a plan; Home, Runs and
 * Account before there is one). On a phone or tablet it's
 * fixed to the bottom like an installed app's, clear of the home indicator; on a desktop it stands down the left as a
 * rail. The app decides what tapping the current page does (Plan, for instance, goes back to this week).
 */
export function TabBar({ current, onPick, account, variant = 'bar', hasPlan = true }: Props) {
  const items = hasPlan ? ITEMS : ITEMS.filter((item) => !NEEDS_PLAN.includes(item.id))
  const active = items.findIndex((item) => item.id === current)
  return (
    <nav
      className={variant === 'rail' ? 'tab-bar tab-rail' : 'tab-bar'}
      aria-label="Main"
      style={{ '--active-tab': active, '--tab-count': items.length } as CSSProperties}
    >
      {active >= 0 && <span className="tab-bar-indicator" aria-hidden="true" />}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="tab-bar-item"
          aria-current={current === item.id ? 'page' : undefined}
          onClick={() => onPick(item.id)}
        >
          {item.id === 'account' && account ? (
            <Avatar name={account.name} photo={account.photo} size={24} />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={ICONS[item.id]} />
            </svg>
          )}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
