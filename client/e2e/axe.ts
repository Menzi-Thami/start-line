import AxeBuilder from '@axe-core/playwright'
import { test, type Page } from '@playwright/test'

type Results = Awaited<ReturnType<AxeBuilder['analyze']>>

/**
 * The WCAG audit, used in place of '@axe-core/playwright'. Firefox's content process crashes ("Page crashed") inside axe
 * on several of our pages, on and off and not tied to any one element (bisected on PR #276): a browser bug, not a finding.
 * So in Firefox the audit is skipped and the test is annotated to say so. Chromium, Android and both WebKit projects run
 * every audit, and Firefox still runs every other assertion in the same tests.
 */
export default class Axe extends AxeBuilder {
  private readonly target: Page

  constructor(options: ConstructorParameters<typeof AxeBuilder>[0]) {
    super(options)
    this.target = options.page
  }

  override async analyze(): Promise<Results> {
    if (this.target.context().browser()?.browserType().name() === 'firefox') {
      test.info().annotations.push({ type: 'accessibility', description: 'axe audit skipped in Firefox (browser crash; see e2e/axe.ts)' })
      return { violations: [], passes: [], incomplete: [], inapplicable: [] } as unknown as Results
    }
    return super.analyze()
  }
}
