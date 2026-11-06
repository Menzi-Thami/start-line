// Usage: node capture.cjs <outDir> [only-width]
const { chromium } = require('../../../client/node_modules/playwright');
const base = 'http://127.0.0.1:5191/e2e/fixtures/ux-shell.html';
const out = process.argv[2];
const sizes = { phone: { width: 390, height: 844 }, tablet: { width: 768, height: 1024 }, desktop: { width: 1440, height: 900 } };
const only = process.argv[3];
(async () => {
  const b = await chromium.launch();
  for (const [name, viewport] of Object.entries(sizes)) {
    if (only && only !== name) continue;
    for (const scheme of ['light', 'dark']) {
      const ctx = await b.newContext({ viewport, colorScheme: scheme, reducedMotion: 'reduce', isMobile: name === 'phone', hasTouch: name === 'phone', deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      const errors = []; p.on('pageerror', (e) => errors.push(e.message));
      const shot = async (id) => { await p.waitForTimeout(700); await p.screenshot({ path: `${out}/${id}-${name}-${scheme}.png`, fullPage: true }); };
      const nav = async (label) => {
        const bar = p.locator('nav.tab-bar button', { hasText: label });
        if (await bar.count()) return bar.first().click();
        return p.locator('.nav-link', { hasText: label }).first().click();
      };
      try {
        await p.goto(base + '?view=home'); await p.waitForTimeout(1500); await shot('S01-home');
        await nav('Plan'); await p.waitForTimeout(1200); await shot('S05-plan-week');
        const cal = p.getByRole('tab', { name: /calendar/i }); if (await cal.count()) { await cal.first().click(); await shot('S06-plan-calendar'); }
        const prog = p.getByRole('tab', { name: /progress/i }); if (await prog.count()) { await prog.first().click(); await shot('S10-progress'); }
        const wk = p.getByRole('tab', { name: /this week|week/i }); if (await wk.count()) { await wk.first().click(); await p.waitForTimeout(500); }
        const dayBtn = p.locator('[data-day], .week-day button, .day-card button, .week-list button').first();
        if (await dayBtn.count()) { await dayBtn.click().catch(() => {}); await shot('S07-day'); }
        await nav('Runs'); await p.waitForTimeout(1200); await shot('S08-runs');
        const runRow = p.locator('.run-card, .my-runs li button, .my-runs a, [data-run-id]').first();
        if (await runRow.count()) { await runRow.click().catch(() => {}); await p.waitForTimeout(1000); await shot('S09-run'); }
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
