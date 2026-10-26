/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A mistyped var() in a transition or animation silently turns the motion off, so every motion token a stylesheet
// uses must be defined in tokens.css.
const dir = import.meta.dirname
const sheets = readdirSync(dir)
  .filter((file) => file.endsWith('.css'))
  .map((file) => ({ file, css: readFileSync(join(dir, file), 'utf8') }))

describe('motion tokens', () => {
  const tokens = sheets.find((s) => s.file === 'tokens.css')?.css ?? ''
  const defined = new Set([...tokens.matchAll(/(--(?:dur|ease)-[a-z-]+)\s*:/g)].map((m) => m[1]))

  it('defines durations and easings', () => {
    expect(defined.size).toBeGreaterThan(0)
  })

  it('has every --dur-* and --ease-* that the stylesheets use', () => {
    const used = new Set<string>()
    for (const { css } of sheets) {
      for (const m of css.matchAll(/var\((--(?:dur|ease)-[a-z-]+)\)/g)) used.add(m[1]!)
    }
    expect(used.size).toBeGreaterThan(0)
    expect([...used].filter((name) => !defined.has(name))).toEqual([])
  })
})
