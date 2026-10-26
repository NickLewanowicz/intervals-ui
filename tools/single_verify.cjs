/**
 * Round-15 single-proposal verification against PRODUCTION: a single unrelated
 * proposal must open the NORMAL ProposalModal (never the bundle sheet), and
 * Dismiss resolves it. Never clicks Approve. Usage: node tools/single_verify.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://intervals.imnick.dev';
const OUT = path.join(__dirname, '..', 'qa-screenshots', 'round-15-bundles');
const creds = fs
  .readFileSync(path.join(__dirname, '..', '.scratch', 'dev-user.txt'), 'utf8')
  .split('\n')[0]
  .split(' ');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));

  await page.goto(URL + '/sign-in', { waitUntil: 'networkidle' });
  await page.getByRole('textbox').first().fill(creds[0]);
  await page.getByRole('textbox').nth(1).fill(creds[2]);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/calendar/, { timeout: 30000 });
  await page.goto(URL + '/coach', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const input = page.getByPlaceholder(/Message your coach/i);
  await input.click();
  await input.fill('Add a 20min Z1 shakeout run Friday 7am');
  await page.getByRole('button', { name: /send/i }).click();

  // wait for the normal modal (stable text prefix), never the bundle sheet
  let opened = false;
  for (let i = 0; i < 24 && !opened; i++) {
    await page.waitForTimeout(10000);
    opened =
      (await page.getByText(/you approve every change/i).count()) > 0 &&
      (await page.locator('[data-testid="bundle-sheet"]').count()) === 0;
  }
  if (!opened) {
    console.log(JSON.stringify({ steps: ['FAIL: single proposal did not open the normal modal'], consoleErrors: errors }, null, 2));
    process.exitCode = 1;
    await browser.close();
    return;
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'single-modal.png') });
  await page.getByRole('button', { name: /^dismiss$/i }).click();
  await page.getByText(/you approve every change/i).first().waitFor({ state: 'detached', timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'coach-after-single-dismiss.png') });

  if (errors.length > 0) {
    console.log(JSON.stringify({ steps: ['single modal opened + dismissed', `FAIL: ${errors.length} console error(s)`], consoleErrors: errors }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ steps: ['single modal opened', 'dismissed', 'zero console errors'], consoleErrors: [] }, null, 2));
  }
  await browser.close();
})().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(1);
});
