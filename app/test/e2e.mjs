/**
 * End-to-end test of the real user journey in headless Chrome, using a virtual passkey authenticator.
 * Prereq: `npm run demo` running (fresh chain, relayer, app). APP_URL defaults to http://localhost:5199.
 *   npm run test:e2e --prefix app
 * Screenshots land in app/test/screens/.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL = process.env.APP_URL || 'http://localhost:5199/';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync('test/screens', { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 860 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

const cdp = await page.createCDPSession();
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });

let n = 0;
const step = (s) => console.log(`▸ ${++n}. ${s}`);
const shot = (name, full = true) => page.screenshot({ path: `test/screens/${name}.png`, fullPage: full });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitText(text, timeout = 30000, sel = 'body') {
  const re = text instanceof RegExp ? text : new RegExp(text.replace(/[.*+?^${}()|[\]\\$]/g, '\\$&'));
  const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < timeout) { last = await page.$eval(sel, (el) => el.innerText).catch(() => ''); if (re.test(last)) return last; await sleep(250); }
  throw new Error(`Timed out waiting for ${re} in ${sel}. Page text: ${last.slice(0, 500)}`);
}
async function clickText(text, sel = 'button, a') {
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const ok = await page.evaluate((text, sel) => {
      const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null && !e.disabled && e.innerText.trim().includes(text));
      const el = els.at(-1); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
    }, text, sel);
    if (ok) return; await sleep(200);
  }
  throw new Error(`No clickable "${text}"`);
}
const click = async (sel) => {
  await page.waitForFunction((sel) => [...document.querySelectorAll(sel)].some((e) => e.offsetParent !== null), { timeout: 30000 }, sel);
  await page.evaluate((sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null); el.scrollIntoView({ block: 'center' }); el.click(); }, sel);
};
const typeAmount = async (v) => { await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.type(v, { delay: 20 }); };

try {
  step('landing page');
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await waitText('Invest on your time');
  await shot('01-landing');

  step('create account with a passkey');
  await clickText('Get started', 'a');
  await page.waitForSelector('#name');
  await page.type('#name', 'Ada');
  await shot('02-create-account', false);
  await clickText('Secure with Face ID');
  await waitText('Add money to start investing');
  await waitText('Hi Ada');
  const address1 = await page.evaluate(() => JSON.parse(localStorage.getItem('gifted.profile')).address);
  const kind = await page.evaluate(() => JSON.parse(localStorage.getItem('gifted.profile')).kind);
  if (kind !== 'passkey') throw new Error(`expected a synced passkey account, got ${kind}`);
  await shot('03-home-empty');

  step('add $500 from the test bank');
  await clickText('Add money');
  await waitText('Test bank', 10000, '[role=dialog]');
  await typeAmount('500');
  await click('[data-testid=add-confirm]');
  await waitText('$500.00 added', 60000, '[role=dialog]');
  await clickText('Done');
  await waitText(/Buying power\s*\$500\.00/);

  step('buy $100 of TSLA from the stock page');
  await click('[data-testid=stock-TSLA]');
  await waitText(/About TSLA/, 15000);
  await page.waitForSelector('[data-testid=card-amount]', { visible: true });
  await page.type('[data-testid=card-amount]', '100');
  await click('[data-testid=order-panel] [data-testid=review]');
  await waitText('Buy $100.00 of TSLA', 5000, '[data-testid=order-panel]');
  await shot('04-review', false);
  await click('[data-testid=order-panel] [data-testid=confirm]');
  await waitText(/You bought [\d.]+ shares of TSLA/, 60000, '[data-testid=order-panel]');
  await shot('05-bought', false);
  await clickText('Done');
  await waitText('Your market value', 20000);
  await waitText('Your average cost');

  step('start a $25 daily recurring investment, first buy today');
  await page.waitForSelector('[data-testid=card-amount]', { visible: true });
  await page.select('[data-testid=order-panel] [aria-label="Order type"]', 'recurring');
  await page.type('[data-testid=card-amount]', '25');
  await page.select('[data-testid=order-panel] [aria-label="Frequency"]', '86400');
  await click('[data-testid=order-panel] [data-testid=review]');
  await click('[data-testid=order-panel] [data-testid=confirm]');
  await waitText('$25.00 of TSLA every day', 60000, '[data-testid=order-panel]');
  await clickText('Done');

  step('place a $50 limit buy 5% below the price');
  await page.waitForSelector('[data-testid=card-amount]', { visible: true });
  await page.select('[data-testid=order-panel] [aria-label="Order type"]', 'limit');
  await page.type('[data-testid=card-amount]', '50');
  const lim = await page.$eval('[data-testid=card-limit]', (e) => e.value);
  if (!lim) throw new Error('limit price was not pre-filled');
  await click('[data-testid=order-panel] [data-testid=review]');
  await click('[data-testid=order-panel] [data-testid=confirm]');
  await waitText('Limit order placed', 60000, '[data-testid=order-panel]');
  await clickText('Done');
  await waitText('Limit buy at');
  await shot('06-stock-detail');

  step('keeper runs the first recurring buy automatically');
  await page.goto(URL + 'activity', { waitUntil: 'networkidle0' });
  await waitText('Recurring investment ·', 60000);

  step('TSLA drops 10% (demo tools), keeper fills the limit order');
  await page.goto(URL + 'account', { waitUntil: 'networkidle0' });
  await waitText('Demo tools');
  await click('[data-testid="move-0.1"]');
  await waitText('TSLA down 10%', 30000);
  await page.goto(URL + 'activity', { waitUntil: 'networkidle0' });
  await waitText('Limit order filled', 60000);
  await shot('07-activity');

  step('sell 25% of TSLA');
  await page.goto(URL + 'stocks/TSLA', { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid=card-amount]', { visible: true });
  await page.select('[data-testid=order-panel] [aria-label="Buy or sell"]', 'sell');
  await page.type('[data-testid=card-amount]', '20');
  await click('[data-testid=order-panel] [data-testid=review]');
  await click('[data-testid=order-panel] [data-testid=confirm]');
  await waitText(/You sold [\d.]+ shares of TSLA/, 60000, '[data-testid=order-panel]');
  await clickText('Done');

  step('pause the recurring investment');
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await clickText('of TSLA · every day');
  await waitText('Recurring investment', 10000, '[role=dialog]');
  await clickText('Pause', '[role=dialog] button');
  await waitText('Recurring investment paused', 30000);
  await waitText('Paused');
  await shot('08-home-invested');

  step('withdraw $20 to the wallet');
  await click('[data-testid=buying-power]');
  await clickText('Withdraw', '[role=dialog] button');
  await typeAmount('20');
  await click('[data-testid=withdraw-confirm]');
  await waitText('$20.00 withdrawn', 60000, '[role=dialog]');
  await clickText('Done');

  step('reload keeps you signed in');
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Your stocks', 20000);

  step('sign out, then sign back in with the same passkey');
  await page.goto(URL + 'account', { waitUntil: 'networkidle0' });
  await click('[data-testid=sign-out]');
  await waitText('Invest on your time');
  await clickText('Log in', 'a');
  await click('[data-testid=login-passkey]');
  await waitText('Your stocks', 30000);
  const address2 = await page.evaluate(() => JSON.parse(localStorage.getItem('gifted.profile')).address);
  if (address1 !== address2) throw new Error(`passkey sign-in restored a different account: ${address1} vs ${address2}`);

  step('phone layout: stock page, buy sheet with keypad, dark mode');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await waitText('Your stocks', 20000);
  await shot('09-mobile-home');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflow) throw new Error('horizontal overflow on phone');
  await page.goto(URL + 'stocks/AMZN', { waitUntil: 'networkidle0' });
  await click('[data-testid=buy-cta]');
  await page.waitForFunction(() => (() => { const r = document.querySelector('[aria-label=Keypad]')?.getBoundingClientRect(); return !!r && r.width > 0 && r.height > 0; })(), { timeout: 15000 });
  for (const k of ['1', '5']) await page.click(`[aria-label=Keypad] button[aria-label="${k}"]`);
  await waitText('$15', 5000, '[role=dialog]');
  await shot('10-mobile-buy-sheet', false);
  await page.keyboard.press('Escape');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(URL + 'stocks/AMZN', { waitUntil: 'networkidle0' });
  await sleep(800);
  await shot('11-mobile-stock-dark', false);

  if (errors.length) throw new Error('Browser errors:\n' + errors.join('\n'));
  console.log(`\nALL ${n} STEPS PASSED`);
} catch (e) {
  console.log('\nFAILED:', e.message);
  await shot('failure').catch(() => {});
  if (errors.length) console.log('Browser errors:\n' + errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
