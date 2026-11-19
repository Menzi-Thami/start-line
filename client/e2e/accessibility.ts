import AxeBuilder from './axe'
import { type Page } from '@playwright/test'

/** Keep the complete WCAG audit in one place. */
export function accessibility(page: Page) {
  const audit = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
  return audit
}
