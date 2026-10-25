/**
 * Capture marketing screenshots of the deployed app (and intervals.icu's
 * public page) into apps/expo/assets/marketing/. Reproducible: re-run after
 * notable UI changes and rebuild.
 * Usage: node tools/marketing_shots.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = 'https://intervals.imnick.dev';
const OUT = path.join(__dirname, '..', 'apps', 'expo', 'assets', 'marketing');
const creds = fs
  .readFileSync(path.join(__dirname, '..', '.scratch', 'dev-user.txt'), 'utf8')
  .split('\n')[0]
  .split(' ');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  const signIn = async (page) => {
    await page.goto(URL + '/sign-in', { waitUntil: 'networkidle' });
    await page.getByRole('textbox').first().fill(creds[0]);
    await page.getByRole('textbox').nth(1).fill(creds[2]);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/calendar/, { timeout: 30000 });
    await page.waitForTimeout(3000);
  };

  // 1) Desktop calendar (MacBook frame): 1440x900, scrolled to the hero
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await signIn(desktop);
  await desktop.evaluate(() => {
    const s = [...document.querySelectorAll('*')].find(
      (e) => e.scrollHeight > e.clientHeight + 100,
    );
    if (s) s.scrollTop = 0;
    window.scrollTo(0, 0);
  });
  await desktop.waitForTimeout(800);
  await desktop.screenshot({ path: path.join(OUT, 'app-calendar-desktop.png') });
  await desktop.close();

  // 2+3) Mobile coach conversation + proposal modal (phone frame): 393x852 @2x
  const mobile = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
  });
  await signIn(mobile);
  await mobile.getByText('Coach', { exact: true }).click();
  await mobile.waitForTimeout(2500);
  const input = mobile.getByPlaceholder(/Message your coach/i);
  await input.click();
  await input.fill('What should I adjust this week?');
  await mobile.getByRole('button', { name: /send/i }).click();
  await mobile.waitForTimeout(18000); // stream + complete
  await mobile.screenshot({ path: path.join(OUT, 'app-coach-mobile.png') });

  await input.click();
  await input.fill('Add a 30 minute easy Z1 recovery jog on Thursday at 7am.');
  await mobile.getByRole('button', { name: /send/i }).click();
  await mobile.waitForSelector('text=Approve', { timeout: 45000 }).catch(() => {});
  await mobile.waitForTimeout(1500); // timeline render settle
  await mobile.screenshot({ path: path.join(OUT, 'app-proposal-mobile.png') });
  const dismiss = mobile.getByText('Dismiss', { exact: true });
  if (await dismiss.count()) await dismiss.first().click();
  await mobile.waitForTimeout(600);
  await mobile.close();

  // 4) intervals.icu public page (small supporting shot)
  const icu = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await icu.goto('https://intervals.icu/', { waitUntil: 'networkidle', timeout: 45000 });
  await icu.waitForTimeout(1500);
  await icu.screenshot({ path: path.join(OUT, 'intervals-icu.png') });
  await icu.close();

  await browser.close();
  for (const f of fs.readdirSync(OUT)) {
    const kb = Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
    console.log(`${f} — ${kb}KB`);
  }
  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
