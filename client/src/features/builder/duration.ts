export interface Duration {
  h: string
  m: string
  s: string
}

export const durationSeconds = ({ h, m, s }: Duration): number =>
  (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0)

export const toDuration = (totalSeconds: number): Duration => ({
  h: String(Math.floor(totalSeconds / 3600)),
  m: String(Math.floor((totalSeconds % 3600) / 60)),
  s: String(Math.round(totalSeconds % 60)),
})
