/** Smoke test against the deployed testnet site: passkey sign-up, free test dollars, a real TSLA buy. */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const URL = process.env.APP_URL || 'https://gifted-invest.vercel.app/';
mkdirSync('test/screens', { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.setViewport({ width: 1440, height: 900 });
const cdp = await p.createCDPSession();
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });
const step = (s) => console.log('▸', s);
const waitText = async (re, t = 60000, sel = 'body') => { const t0 = Date.now(); let last = ''; while (Date.now() - t0 < t) { last = await p.$eval(sel, (e) => e.innerText).catch(() => ''); if (re.test(last)) return; await new Promise((r) => setTimeout(r, 400)); } throw new Error(`timeout ${re}: ${last.slice(0, 300)}`); };
const clickText = (t, sel = 'button, a') => p.evaluate((t, sel) => { const el = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null && e.innerText.includes(t)).at(-1); el?.click(); return !!el; }, t, sel);
try {
  step('landing'); await p.goto(URL, { waitUntil: 'domcontentloaded' }); await waitText(/Invest on your time/);
  step('sign up with passkey'); await p.goto(URL + 'signup', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#name'); await p.type('#name', 'Judge');
  await clickText('Secure with Face ID'); await waitText(/Add money to start investing/, 90000);
  const addr = await p.evaluate(() => JSON.parse(localStorage.getItem('gifted.profile')).address); console.log('  account', addr);
  step('claim free test dollars'); await clickText('Add money'); await p.waitForSelector('[data-testid=faucet-confirm]');
  await p.click('[data-testid=faucet-confirm]'); await waitText(/\$1,000\.00 added/, 120000, '[role=dialog]'); await clickText('Done');
  step('buy $10 of TSLA'); await p.goto(URL + 'stocks/TSLA', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('[data-testid=card-amount]'); await p.type('[data-testid=card-amount]', '10');
  await p.waitForFunction(() => !document.querySelector('[data-testid=order-panel] [data-testid=review]')?.disabled);
  await p.click('[data-testid=order-panel] [data-testid=review]');
  await p.waitForSelector('[data-testid=confirm]'); await p.evaluate(() => document.querySelector('[data-testid=confirm]').click());
  await waitText(/You bought [\d.]+ shares of TSLA/, 120000, '[data-testid=order-panel]');
  console.log('  ', (await p.$eval('[data-testid=order-panel]', (e) => e.innerText)).split('\n').slice(0, 3).join(' | '));
  await p.screenshot({ path: 'test/screens/prod-bought.png' });
  console.log(errs.length ? 'ERRORS ' + errs.join('; ') : 'PROD SMOKE PASSED');
  console.log('ADDR', addr);
} catch (e) { console.log('FAILED', e.message); await p.screenshot({ path: 'test/screens/prod-failure.png' }); process.exitCode = 1; }
await b.close();
