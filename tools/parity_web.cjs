#!/usr/bin/env node
/**
 * Web half of the parity capture flow (see tools/parity_shots.sh).
 * Usage: node tools/parity_web.cjs <outDir> <url> <credFile>
 *
 * Round-2 flow (week view v2):
 *   1. MOBILE 393x851 dark  — full flow; week detail = bottom SHEET (<900px)
 *   2. MOBILE 393x851 light — week view (pills/sheet/month panel) + coach/settings
 *   3. DESKTOP 1280x900 dark  — week detail = DetailSidePanel (>=900px):
 *      open/animation, re-target, "Open full" -> /calendar/day, X close
 *   4. DESKTOP 1280x900 light — week top + panel open
 *
 * Shot names match the emulator flow 1:1 (mobile passes); desktop shots are
 * d-* / d-light-*. Requires playwright (NODE_PATH=/opt/homebrew/lib/node_modules).
 */
const { chromium } = require('playwright');
const fs = require('fs');

const MOBILE = { width: 393, height: 851 };
const DESKTOP = { width: 1280, height: 900 };
const THURSDAY = 'Thursday 22'; // the planned+recorded day in the live week

async function main() {
  const [out, url, credFile] = process.argv.slice(2);
  if (!out || !url || !credFile) {
    console.error('usage: parity_web.cjs <outDir> <url> <credFile>');
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

  async function session(colorScheme, viewport) {
    const ctx = await browser.newContext({
      viewport,
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
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
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
    // week view v2 flows ----------------------------------------------------
    const openSheet = async () => {
      await page.getByLabel(`Open ${THURSDAY} details`, { exact: true }).first().click();
      await page.waitForTimeout(900); // slide-up
    };
    const closeViaX = async () => {
      await page.getByLabel('Close day detail', { exact: true }).first().click();
      await page.waitForTimeout(600);
    };
    const dragSheetClosed = async () => {
      // drag the grabber/head row straight down (PanResponder: dy>110 or vy>0.9)
      const t = page.getByText(/^Thu 22 [A-Z][a-z]{2}$/).first(); // sheet title "Thu 22 Oct"
      const box = await t.boundingBox();
      const y0 = box ? box.y + box.height / 2 : 200;
      await page.mouse.move(viewport.width / 2, y0);
      await page.mouse.down();
      await page.mouse.move(viewport.width / 2, y0 + 60, { steps: 2 });
      await page.mouse.move(viewport.width / 2, y0 + 500, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(700);
      return (await page.getByLabel('Close day detail').count()) === 0;
    };
    const monthPanel = async () => {
      await page.getByText('Month', { exact: true }).first().click();
      await page.waitForTimeout(1200);
      await page.getByText('22', { exact: true }).first().click();
      await page.waitForTimeout(900);
    };
    return { ctx, page, shot, wheel, signIn, openSheet, closeViaX, dragSheetClosed, monthPanel };
  }

  const widthOfWeekGroup = (page) =>
    page.evaluate(() => {
      const el = document.querySelector(
        '[data-testid="week-group"], [testid="week-group"], [testID="week-group"]',
      );
      return el ? Math.round(el.getBoundingClientRect().width) : null;
    });

  // ==================================================================
  // 1) MOBILE DARK pass (matches emulator night mode)
  // ==================================================================
  {
    const { ctx, page, shot, wheel, signIn, openSheet, closeViaX, dragSheetClosed, monthPanel } =
      await session('dark', MOBILE);
    await page.goto(url + '/', { waitUntil: 'networkidle', timeout: 45000 });
    await shot('01-splash', 800);

    await signIn('02-sign-in-filled');
    await page.waitForTimeout(8000); // PocketBase sync can cold-start
    await shot('03-calendar-week');

    await wheel(-4000); await wheel(-4000); // to the top (hero + pills + day cards)
    await shot('04-week-top');

    await page.getByRole('tab', { name: `Select ${THURSDAY}` }).click();
    await page.waitForTimeout(900); // scroll-to-day animation
    await shot('05-week-pill-selected');

    await openSheet();
    await shot('06-sheet-open');

    await page.getByLabel('Open full day detail for Thu 22', { exact: true }).first().click();
    await page.waitForURL(/calendar\/day/, { timeout: 15000 });
    await shot('06b-day-route', 1000);
    await page.goBack();
    await page.waitForTimeout(1200);

    await openSheet();
    const dragged = await dragSheetClosed();
    if (!dragged) {
      console.log('  (drag did not close the sheet — falling back to X)');
      await closeViaX();
    }
    await shot('07-sheet-drag-result');

    await openSheet();
    await closeViaX();
    await shot('07b-sheet-x-closed');

    await monthPanel();
    await shot('08-calendar-month', 600);
    await shot('08b-month-day-panel');
    await wheel(1500);
    await shot('08c-month-panel-runs');

    await page.getByText('Coach', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    const newChat = page.locator('[aria-label="New chat"], [title="New chat"]').first();
    if (await newChat.count()) { await newChat.click(); await page.waitForTimeout(1200); }
    await shot('09-coach-empty');

    const input = page.getByPlaceholder(/Message your coach/);
    await input.fill('What does my week look like?');
    await input.press('Enter');
    await page.waitForTimeout(6000);
    await shot('10-coach-reply-streamed');
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(5000);
      const thinking = await page.getByPlaceholder(/thinking/i).count();
      if (!thinking) break;
    }
    await shot('11-coach-reply-done');
    await wheel(6000); await wheel(6000);
    await shot('11b-coach-chat-bottom');

    await page.getByText('Settings', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    await shot('12-settings');
    await wheel(4000);
    await shot('12b-settings-scrolled');

    await wheel(-9000); await wheel(-9000);
    await page.getByText('Sign out', { exact: true }).first().click();
    await page.waitForURL(/sign-in/, { timeout: 20000 });
    await shot('13-sign-out', 800);
    await ctx.close();
  }

  // ==================================================================
  // 2) MOBILE LIGHT pass — week view v2 + coach/settings spot checks
  // ==================================================================
  {
    const { ctx, page, shot, wheel, signIn, openSheet, closeViaX, monthPanel } =
      await session('light', MOBILE);
    await signIn();
    await page.waitForTimeout(6000);
    await wheel(-4000); await wheel(-4000);
    await shot('light-04-week-top');
    await page.getByRole('tab', { name: `Select ${THURSDAY}` }).click();
    await page.waitForTimeout(900);
    await shot('light-05-week-pill-selected');
    await openSheet();
    await shot('light-06-sheet-open');
    await closeViaX();
    await monthPanel();
    await shot('light-08b-month-day-panel', 500);
    await wheel(1500);
    await shot('light-08c-month-panel-runs');
    await page.getByText('Coach', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    const newChat = page.locator('[aria-label="New chat"], [title="New chat"]').first();
    if (await newChat.count()) { await newChat.click(); await page.waitForTimeout(1200); }
    await shot('light-09-coach');
    await page.getByText('Settings', { exact: true }).last().click();
    await page.waitForTimeout(2000);
    await shot('light-12-settings');
    await ctx.close();
  }

  // ==================================================================
  // 3) DESKTOP DARK pass (>=900px) — DetailSidePanel flows
  // ==================================================================
  {
    const { ctx, page, shot, wheel, signIn } = await session('dark', DESKTOP);
    await signIn();
    await page.waitForTimeout(6000);
    await wheel(-6000); await wheel(-6000);
    await shot('d-01-week-top', 500);
    const wClosed = await widthOfWeekGroup(page);

    await page.getByLabel(`Open ${THURSDAY} details`, { exact: true }).first().click();
    await shot('d-02-panel-anim', 60); // mid-animation attempt (~200ms slide/fade)
    await page.waitForTimeout(700);
    await shot('d-02-panel-open');
    const wOpen = await widthOfWeekGroup(page);
    console.log(`  [measure] week list width: closed=${wClosed}px open=${wOpen}px (expect narrower)`);

    await page.getByLabel('Open Monday 19 details', { exact: true }).first().click();
    await page.waitForTimeout(700);
    await shot('d-03-panel-retarget');

    await page.getByLabel('Open full day detail for Mon 19', { exact: true }).first().click();
    await page.waitForURL(/calendar\/day/, { timeout: 15000 });
    await shot('d-04-day-route', 1000);
    await page.goBack();
    await page.waitForTimeout(1200);

    await page.getByLabel('Open Monday 19 details', { exact: true }).first().click();
    await page.waitForTimeout(700);
    await page.getByLabel('Close day detail', { exact: true }).first().click();
    await page.waitForTimeout(600);
    await shot('d-05-panel-closed');
    const wRe = await widthOfWeekGroup(page);
    console.log(`  [measure] week list width after close=${wRe}px (expect == closed=${wClosed}px)`);
    await ctx.close();
  }

  // ==================================================================
  // 4) DESKTOP LIGHT pass — week top + panel open
  // ==================================================================
  {
    const { ctx, page, shot, wheel, signIn } = await session('light', DESKTOP);
    await signIn();
    await page.waitForTimeout(6000);
    await wheel(-6000); await wheel(-6000);
    await shot('d-light-01-week-top', 500);
    await page.getByLabel(`Open ${THURSDAY} details`, { exact: true }).first().click();
    await page.waitForTimeout(700);
    await shot('d-light-02-panel-open');
    await ctx.close();
  }

  await browser.close();
  console.log(`done — web captures in ${dir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
