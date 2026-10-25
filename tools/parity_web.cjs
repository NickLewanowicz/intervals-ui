#!/usr/bin/env node
/**
 * Web half of the parity capture flow (see tools/parity_shots.sh).
 * Usage: node tools/parity_web.js <outDir> <url> <credFile>
 *
 * Captures the full signed-in flow at 393x851 in DARK (matches the emulator's
 * night mode), then a LIGHT pass over calendar/coach/settings. Shots land in
 * <outDir>/web/*.png — names 1:1 with the emulator flow.
 *
 * Requires playwright (NODE_PATH=/opt/homebrew/lib/node_modules on this machine).
 */
const { chromium } = require('playwright');
const fs = require('fs');

const SHOT_LIST = '01-splash 02-sign-in-filled 03-calendar-week 04-calendar-week-settled ' +
  '04b-calendar-week-scrolled 05-calendar-month 06-calendar-month-day-panel ' +
  '06b-calendar-month-day-panel 06c-day-detail 07-coach-empty 08-coach-reply-streamed ' +
  '09-coach-reply-done 09b-coach-chat-bottom 10-settings 10b-settings-scrolled ' +
  '10c-settings-theme 11-sign-out';

async function main() {
  const [out, url, credFile] = process.argv.slice(2);
  if (!out || !url || !credFile) {
    console.error('usage: parity_web.js <outDir> <url> <credFile>');
    process.exit(1);
  }
  const line0 = fs.readFileSync(credFile, 'utf8').split('\n')[0].trim();
  const parts = line0.split(/\s+/);
  const email = parts[0];
  const pass = parts[parts.length - 1]; // file format: "email / password"
  if (!email.includes('@') || email === pass) {
    throw new Error('could not parse creds (expect: email / password on line 1)');
  }

  const dir = `${out}/web`;
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();

  async function session(colorScheme) {
    const ctx = await browser.newContext({
      viewport: { width: 393, height: 851 },
      deviceScaleFactor: 1,
      colorScheme,
    });
    const page = await ctx.newPage();
    const shot = async (name, waitMs = 400) => {
      await page.waitForTimeout(waitMs);
      await page.screenshot({ path: `${dir}/${name}.png` });
      console.log(`  web/${name}.png`);
    };
    const wheel = async (dy) => {
      await page.mouse.move(196, 400);
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
    return { ctx, page, shot, wheel, signIn };
  }

  // ---------- DARK pass (primary, matches emulator night mode) ----------
  {
    const { ctx, page, shot, wheel, signIn } = await session('dark');
    await page.goto(url + '/', { waitUntil: 'networkidle', timeout: 45000 });
    await shot('01-splash', 800);

    await signIn('02-sign-in-filled');
    await page.waitForTimeout(8000); // PocketBase sync can cold-start
    await shot('03-calendar-week');
    await page.waitForTimeout(1500);
    await shot('04-calendar-week-settled');

    await wheel(-4000); await wheel(-4000); // to the top — also proves web scrolls now
    await shot('04b-calendar-week-scrolled');

    await page.getByText('Month', { exact: true }).first().click();
    await page.waitForTimeout(1500);
    await shot('05-calendar-month');

    await page.getByText('22', { exact: true }).first().click();
    await page.waitForTimeout(1000);
    await shot('06-calendar-month-day-panel');
    await wheel(4000);
    await shot('06b-calendar-month-day-panel');

    const openDay = page.locator('[aria-label^="Open full day detail"]').first();
    if (await openDay.count()) {
      await openDay.click();
      await page.waitForTimeout(1500);
    }
    await shot('06c-day-detail');
    await page.goBack();
    await page.waitForTimeout(1000);

    await page.getByText('Coach', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    const newChat = page.locator('[aria-label="New chat"], [title="New chat"]').first();
    if (await newChat.count()) { await newChat.click(); await page.waitForTimeout(1200); }
    await shot('07-coach-empty');

    const input = page.getByPlaceholder(/Message your coach/);
    await input.fill('What does my week look like?');
    await input.press('Enter');
    await page.waitForTimeout(6000);
    await shot('08-coach-reply-streamed');
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(5000);
      const thinking = await page.getByPlaceholder(/thinking/i).count();
      if (!thinking) break;
    }
    await shot('09-coach-reply-done');
    await wheel(6000); await wheel(6000);
    await shot('09b-coach-chat-bottom');

    await page.getByText('Settings', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    await shot('10-settings');
    await wheel(4000);
    await shot('10b-settings-scrolled');
    await wheel(4000); await wheel(4000);
    await shot('10c-settings-theme');

    await wheel(-9000); await wheel(-9000);
    await page.getByText('Sign out', { exact: true }).first().click();
    await page.waitForURL(/sign-in/, { timeout: 20000 });
    await shot('11-sign-out', 800);
    await ctx.close();
  }

  // ---------- LIGHT pass (calendar / coach / settings only) ----------
  {
    const { ctx, page, shot, wheel, signIn } = await session('light');
    await signIn();
    await page.waitForTimeout(6000);
    await shot('light-03-calendar-week');
    await wheel(-4000); await wheel(-4000);
    await shot('light-04b-calendar-week-top');

    await page.getByText('Coach', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    await shot('light-07-coach');

    await page.getByText('Settings', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    await shot('light-10-settings');
    await ctx.close();
  }

  await browser.close();
  console.log(`done — expect ${SHOT_LIST.split(' ').length} dark shots + 4 light shots in ${dir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
