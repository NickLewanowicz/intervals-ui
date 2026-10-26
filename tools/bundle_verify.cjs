/**
 * Round-15 bundle verification against PRODUCTION (proposal-approval v2 §2).
 * Signs in with the dev user, drives the coach chat, and asserts:
 *   1. the two-session-cut prompt opens the BUNDLE sheet (testID bundle-sheet)
 *      — screenshots at mobile + desktop widths;
 *   2. multi-select works (uncheck one row → "Approve selected (1)");
 *   3. Dismiss all (two-tap confirm) clears the bundle;
 *   4. a single unrelated proposal opens the normal modal → Dismiss;
 *   5. zero console errors.
 * NEVER clicks Approve. Usage: node tools/bundle_verify.cjs
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

const BUNDLE_PROMPT =
  "This week is too much — cut Wednesday's steady aerobic from 9km to 6km and Thursday's easy run from 8km to 5km. Same reasons as we discussed.";
const NUDGE_PROMPT =
  'Re-propose those two cuts — the steady aerobic from 9km to 6km and Thursday\'s easy run from 7.7km to 5km — as ONE bundle: give both tool calls the same bundle.summary short shared label so they review together.';
const SINGLE_PROMPT = 'Add a 20min Z1 shakeout Friday 7am';

const consoleErrors = [];

async function newPage(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.width < 800 ? 2 : 1 });
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 300)}`));
  return page;
}

async function signIn(page) {
  await page.goto(URL + '/sign-in', { waitUntil: 'networkidle' });
  await page.getByRole('textbox').first().fill(creds[0]);
  await page.getByRole('textbox').nth(1).fill(creds[2]);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/calendar/, { timeout: 30000 });
  await page.waitForTimeout(2500);
}

async function gotoCoach(page) {
  await page.goto(URL + '/coach', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
}

async function send(page, text) {
  const input = page.getByPlaceholder(/Message your coach/i);
  await input.click();
  await input.fill(text);
  await page.getByRole('button', { name: /send/i }).click();
}

async function expectSheetOrModal(page, timeoutMs) {
  const sheet = page.locator('[data-testid="bundle-sheet"]');
  // the single modal's clauses line is the other agent's copy and may change —
  // anchor on the stable prefix ("You approve every change") instead
  const modal = page.getByText(/you approve every change/i);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await sheet.count()) > 0) return 'sheet';
    if ((await modal.count()) > 0) return 'modal';
    await page.waitForTimeout(1000);
  }
  return 'neither';
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const result = { steps: [], consoleErrors };
  const fail = (msg) => {
    result.steps.push(`FAIL: ${msg}`);
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
    browser.close();
  };

  const page = await newPage(browser, { width: 393, height: 852 });
  await signIn(page);
  result.steps.push('signed in');
  await gotoCoach(page);

  // --- 1) bundled prompt → bundle sheet (retry once with a nudge if needed) --
  await send(page, BUNDLE_PROMPT);
  let where = await expectSheetOrModal(page, 240000);
  if (where === 'modal' || where === 'neither') {
    result.steps.push(`model did not bundle on first try (${where}) — clearing, retrying with nudge`);
    await page.screenshot({ path: path.join(OUT, 'retry-single-modal-first-try.png') });
    if (where === 'modal') {
      await page.getByRole('button', { name: /^dismiss$/i }).click();
      await page.waitForTimeout(4000);
    }
    await send(page, NUDGE_PROMPT);
    where = await expectSheetOrModal(page, 240000);
    if (where !== 'sheet') return fail(`nudge retry still no bundle sheet (got ${where})`);
  }
  result.steps.push('bundle sheet opened');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'bundle-sheet-mobile.png') });

  // --- 2) multi-select: uncheck the second row → "Approve selected (1)" -----
  const checkboxes = page.getByRole('checkbox');
  const count = await checkboxes.count();
  if (count < 2) return fail(`expected >=2 checkbox rows, found ${count}`);
  await checkboxes.nth(1).click();
  await page.waitForTimeout(500);
  const approveOne = page.getByRole('button', { name: 'Approve selected (1)' });
  if ((await approveOne.count()) !== 1) return fail('unchecking one row did not yield "Approve selected (1)"');
  result.steps.push('multi-select verified: 2 checked → uncheck → Approve selected (1)');
  await page.screenshot({ path: path.join(OUT, 'bundle-multiselect-one.png') });

  // --- desktop-width screenshot of the same sheet ---------------------------
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'bundle-sheet-desktop.png') });

  // --- 3) Dismiss all (two-tap confirm), never Approve ----------------------
  await page.getByRole('button', { name: 'Dismiss all' }).click();
  await page.waitForTimeout(400);
  const confirm = page.getByRole('button', { name: 'Tap again to dismiss all' });
  if ((await confirm.count()) !== 1) return fail('Dismiss all did not show its confirm step');
  await confirm.click();
  await page.waitForSelector('[data-testid="bundle-sheet"]', { state: 'detached', timeout: 45000 });
  await page.waitForTimeout(2500);
  result.steps.push('bundle dismissed via confirm step; sheet closed');

  // --- 4) single unrelated proposal opens the NORMAL modal ------------------
  await page.setViewportSize({ width: 393, height: 852 });
  await page.waitForTimeout(600);
  await send(page, SINGLE_PROMPT);
  const single = await expectSheetOrModal(page, 240000);
  if (single !== 'modal') {
    return fail(`single proposal expected the normal modal, got: ${single}`);
  }
  await page.waitForTimeout(1200);
  result.steps.push('single proposal opened the normal modal');
  await page.screenshot({ path: path.join(OUT, 'single-modal.png') });
  await page.getByRole('button', { name: /^dismiss$/i }).click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'coach-after-dismissals.png') });

  await page.close();

  if (consoleErrors.length > 0) {
    result.steps.push(`FAIL: ${consoleErrors.length} console error(s)`);
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    result.steps.push('zero console errors');
    console.log(JSON.stringify(result, null, 2));
  }
  await browser.close();
})().catch((e) => {
  console.error('SCRIPT ERROR', e);
  process.exit(1);
});
