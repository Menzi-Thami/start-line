// Usage: node capture.cjs <outDir> [phone|tablet|desktop]
const { chromium } = require('../../../client/node_modules/playwright');
const base = 'http://127.0.0.1:5191/e2e/fixtures/ux-shell.html';
const out = process.argv[2];
const only = process.argv[3];
const sizes = { phone: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } };
(async () => {
  const b = await chromium.launch();
  for (const [name, viewport] of Object.entries(sizes)) {
    if (only && only !== name) continue;
    for (const scheme of ['light', 'dark']) {
      const ctx = await b.newContext({ viewport, colorScheme: scheme, reducedMotion: 'reduce', isMobile: name === 'phone', hasTouch: name === 'phone', deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      const errors = []; p.on('pageerror', (e) => errors.push(e.message));
      const shot = async (id, full = true) => { await p.waitForTimeout(500); await p.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.() }); await p.waitForTimeout(250); await p.screenshot({ path: `${out}/${id}-${name}-${scheme}.png`, fullPage: full }); };
      const nav = (label) => p.locator('nav.tab-bar button').filter({ hasText: label }).first().click();
      try {
        await p.goto(base + '?view=home'); await p.waitForTimeout(1500); await shot('S01-home');
        await nav('Plan'); await p.waitForTimeout(1200); await shot('S05-plan-week');
        const day = p.locator('.week-day-button').nth(3);
        if (await day.count()) {
          await day.click(); await shot('S05b-plan-day-selected');
          const open = p.getByRole('button', { name: /Open day details/ }).first();
          if (await open.count()) { await open.click(); await p.waitForTimeout(900); await shot('S07-day'); await p.goBack(); await p.waitForTimeout(700); }
        }
        const cal = p.getByRole('tab', { name: 'Calendar' }); if (await cal.count()) { await cal.first().click(); await shot('S06-plan-calendar'); }
        await nav('Progress'); await p.waitForTimeout(1200); await shot('S10-progress');
        await nav('Runs'); await p.waitForTimeout(1200); await shot('S08-runs');
        const row = p.locator('.run-feed-open').first();
        if (await row.count()) { await row.click(); await p.waitForTimeout(1200); await shot('S09-run'); }
        await nav('Account'); await p.waitForTimeout(1200); await shot('S11-account');
        await p.goto(base + '?view=home&plan=none'); await p.waitForTimeout(1500); await shot('S02-home-noplan');
        await p.goto(base + '?auth=out'); await p.waitForTimeout(1500); await shot('S03-builder-signedout');
      } catch (e) { console.log(name, scheme, 'FAILED', e.message.split('\n')[0]); }
      if (errors.length) console.log(name, scheme, 'page errors:', errors.slice(0, 3));
      await ctx.close();
    }
  }
  await b.close();
})();
