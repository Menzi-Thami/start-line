import type { SessionType } from '../../lib/types'

export const RUN_TYPES: readonly { value: SessionType; label: string }[] = [
  { value: 'Easy', label: 'Easy run' },
  { value: 'Recovery', label: 'Recovery run' },
  { value: 'LongRun', label: 'Easy long run' },
  { value: 'MediumLongRun', label: 'Medium-long run' },
  { value: 'Tempo', label: 'Tempo run' },
  { value: 'Intervals', label: 'Intervals' },
  { value: 'Hills', label: 'Hills' },
  { value: 'Fartlek', label: 'Fartlek' },
]
export const runTypeName = (type: SessionType) => RUN_TYPES.find((t) => t.value === type)?.label ?? type.replace(/([a-z])([A-Z])/g, '$1 $2')
