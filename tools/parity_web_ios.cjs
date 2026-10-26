#!/usr/bin/env node
/**
 * WEB half of the iOS parity round (qa-parity, iOS bring-up).
 * Usage: NODE_PATH=/opt/homebrew/lib/node_modules node tools/parity_web_ios.cjs <outDir> <url> <credFile>
 *
 * Same flow + shot names as tools/parity_web.cjs (mobile passes) but at the
 * iPhone 16 Pro logical viewport 402x874 with deviceScaleFactor 3, so PNGs
 * are 1206x2622 — byte-for-byte comparable dimensions with
 * `xcrun simctl io <udid> screenshot` captures of intervals-iphone.
 * Output: <outDir>/web/ios-comparison/*.png
 */
const { chromium } = require('playwright');
const fs = require('fs');

const VIEWPORT = { width: 402, height: 874 };
const DAY = 'Monday 26'; // the live week's content day (re-derive when the week rolls: the auto-selected today)

async function main() {
  const [out, url, credFile] = process.argv.slice(2);
  if (!out || !url || !credFile) {
    console.error('usage: parity_web_ios.cjs <outDir> <url> <credFile>');
    process.exit(1);
  }
  const line0 = fs.readFileSync(credFile, 'utf8').split('\n')[0].trim();
  const parts = line0.split(/\s+/);
  const email = parts[0];
  const pass = parts[parts.length - 1];
  if (!email.includes('@') || email === pass) {
    throw new Error('could not parse creds (expect: email / password on line 1)');
  }

  const dir = `${out}/web/ios-comparison`;
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();

  async function session(colorScheme) {
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 3,
      colorScheme,
    });
    const page = await ctx.newPage();
    const shot = async (name, waitMs = 400) => {
      await page.waitForTimeout(waitMs);
      await page.screenshot({ path: `${dir}/${name}.png` });
      console.log(`  ios-comparison/${name}.png`);
    };
    const wheel = async (dy) => {
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
      await page.waitForTimeout(150);
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(600);
    };
    const signIn = async (captureFilled = null) => {
      await page.goto(`${url}/sign-in`, { waitUntil: 'networkidle', timeout: 45000 });
      const inputs = page.locator('input');
      await inputs.nth(0).fill(email);
      await inputs.nth(1).fill(pass);
      if (captureFilled) await shot(captureFilled);
      await page.getByRole('button', { name: /sign in/i }).first().click();
      await page.waitForURL(/calendar/, { timeout: 30000 });
    };
    const openSheet = async () => {
      await page.getByLabel(`Open ${DAY} details`, { exact: true }).first().click();
      await page.waitForTimeout(900);
    };
    const closeViaX = async () => {
      await page.getByLabel('Close day detail', { exact: true }).first().click();
      await page.waitForTimeout(600);
    };
    const dragSheetClosed = async () => {
      const t = page.getByText(/^Mon 26 [A-Z][a-z]{2}$/).first();
      const box = await t.boundingBox();
      const y0 = box ? box.y + box.height / 2 : 200;
      await page.mouse.move(VIEWPORT.width / 2, y0);
      await page.mouse.down();
      await page.mouse.move(VIEWPORT.width / 2, y0 + 60, { steps: 2 });
      await page.mouse.move(VIEWPORT.width / 2, y0 + 500, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(700);
      return (await page.getByLabel('Close day detail').count()) === 0;
    };
    const monthPanel = async () => {
      await page.getByText('Month', { exact: true }).first().click();
      await page.waitForTimeout(1200);
      await page.getByText('26', { exact: true }).first().click();
      await page.waitForTimeout(900);
    };
    const coachEmpty = async () => {
      await page.getByText('Coach', { exact: true }).last().click();
      await page.waitForTimeout(2000);
      const newChat = page.locator('[aria-label="New chat"], [title="New chat"]').first();
      if (await newChat.count()) { await newChat.click(); await page.waitForTimeout(1200); }
    };
    const coachAsk = async () => {
      const input = page.getByPlaceholder(/Message your coach/);
      await input.fill('What does my week look like?');
      await input.press('Enter');
      await page.waitForTimeout(6000);
    };
    const coachWaitDone = async () => {
      for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(5000);
        const thinking = await page.getByPlaceholder(/thinking/i).count();
        if (!thinking) break;
      }
    };
    return {
      ctx, page, shot, wheel, signIn, openSheet, closeViaX, dragSheetClosed,
      monthPanel, coachEmpty, coachAsk, coachWaitDone,
    };
  }

  // ============================== DARK ==============================
  {
    const s = await session('dark');
    const { page } = s;
    await page.goto(url + '/', { waitUntil: 'networkidle', timeout: 45000 });
    await s.shot('01-splash', 800);

    await s.signIn('02-sign-in-filled');
    await page.waitForTimeout(8000);
    await s.shot('03-calendar-week');

    await s.wheel(-4000); await s.wheel(-4000);
    await s.shot('04-week-top');

    await page.getByRole('tab', { name: `Select ${DAY}` }).click();
    await page.waitForTimeout(900);
    await s.shot('05-week-pill-selected');

    await s.openSheet();
    await s.shot('06-sheet-open');

    await page.getByLabel('Open full day detail for Mon 26', { exact: true }).first().click();
    await page.waitForURL(/calendar\/day/, { timeout: 15000 });
    await s.shot('06b-day-route', 1000);
    await page.goBack();
    await page.waitForTimeout(1200);

    await s.openSheet();
    const dragged = await s.dragSheetClosed();
    if (!dragged) {
      console.log('  (drag did not close the sheet — falling back to X)');
      await s.closeViaX();
    }
    await s.shot('07-sheet-drag-result');

    await s.openSheet();
    await s.closeViaX();
    await s.shot('07b-sheet-x-closed');

    await s.monthPanel();
    await s.shot('08-calendar-month', 600);
    await s.shot('08b-month-day-panel');
    await s.wheel(1500);
    await s.shot('08c-month-panel-runs');

    await s.coachEmpty();
    await s.shot('09-coach-empty');
    await s.coachAsk();
    await s.shot('10-coach-reply-streamed');
    await s.coachWaitDone();
    await s.shot('11-coach-reply-done');
    await s.wheel(6000); await s.wheel(6000);
    await s.shot('11b-coach-chat-bottom');

    await page.getByText('Settings', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    await s.shot('12-settings');
    await s.wheel(4000);
    await s.shot('12b-settings-scrolled');

    await s.wheel(-9000); await s.wheel(-9000);
    await page.getByText('Sign out', { exact: true }).first().click();
    await page.waitForURL(/sign-in/, { timeout: 20000 });
    await s.shot('13-sign-out', 800);
    await s.ctx.close();
  }

  // ============================== LIGHT ==============================
  {
    const s = await session('light');
    const { page } = s;
    await s.signIn();
    await page.waitForTimeout(6000);
    await s.wheel(-4000); await s.wheel(-4000);
    await s.shot('light-04-week-top');
    await page.getByRole('tab', { name: `Select ${DAY}` }).click();
    await page.waitForTimeout(900);
    await s.shot('light-05-week-pill-selected');
    await s.openSheet();
    await s.shot('light-06-sheet-open');
    await s.closeViaX();
    await s.monthPanel();
    await s.shot('light-08b-month-day-panel', 500);
    await s.wheel(1500);
    await s.shot('light-08c-month-panel-runs');
    await s.coachEmpty();
    await s.shot('light-09-coach');
    await page.getByText('Settings', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    await s.shot('light-12-settings');
    await s.ctx.close();
  }

  await browser.close();
  console.log(`done — iOS-comparison web captures in ${dir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
