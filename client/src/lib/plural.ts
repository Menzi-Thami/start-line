/** A number with its noun: count(1, 'run') is "1 run", count(3, 'run') "3 runs", count(2, 'entry', 'entries'). */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
