/**
 * GiFTED! relayer: one small service with three jobs.
 *  1. Keeper      runs recurring buys and fills limit orders when the broker says they are ready.
 *  2. Gas sponsor tops up new accounts with a little ETH so users never have to buy gas (POST /drip).
 *  3. Prices      pushes reference prices to the feeds. MARKET_SIM=1 random-walks them (local demo only).
 *
 * Env:
 *   RPC_URL, CHAIN_ID, BROKER_ADDRESS
 *   KEEPER_PRIVATE_KEY           required, must hold the broker keeper role
 *   KEEPER_INTERVAL_MS=15000
 *   DRIP_PRIVATE_KEY             optional, enables the gas sponsor
 *   DRIP_ETH=0.002 DRIP_MIN_ETH=0.0005 PORT=8788
 *   PRICE_PRIVATE_KEY            optional, enables price pushing (must be each feed's updater)
 *   PRICE_SOURCE=live|sim|hold   live = real market prices (Yahoo Finance public chart API),
 *                                sim = random walk (local demo), hold = re-stamp current price
 *   PRICE_INTERVAL_MS=60000      SEED_HISTORY=1 backfills ~3 months of real history into empty feeds
 */
import http from 'node:http';
import { createPublicClient, createWalletClient, http as viemHttp, defineChain, parseEther, formatEther, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const env = process.env;
const RPC_URL = env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const CHAIN_ID = Number(env.CHAIN_ID || 46630);
const BROKER = env.BROKER_ADDRESS;
if (!BROKER || !env.KEEPER_PRIVATE_KEY) { console.error('Set BROKER_ADDRESS and KEEPER_PRIVATE_KEY'); process.exit(1); }

const chain = defineChain({ id: CHAIN_ID, name: `chain-${CHAIN_ID}`, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } } });
const pub = createPublicClient({ chain, transport: viemHttp(RPC_URL) });
const walletFor = (key) => createWalletClient({ chain, transport: viemHttp(RPC_URL), account: privateKeyToAccount(key) });
const log = (tag, ...a) => console.log(new Date().toISOString().slice(11, 19), `[${tag}]`, ...a);
const reason = (e) => (e?.shortMessage || e?.message || String(e)).split('\n')[0];

const brokerAbi = [
  { type: 'function', name: 'plansLength', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'ordersLength', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'planReady', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'orderReady', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'executePlan', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'fillOrder', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'listAssets', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] },
  { type: 'function', name: 'assets', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'address' }, { type: 'uint32' }, { type: 'bool' }] },
];
const erc20Abi = [{ type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }];
const feedAbi = [
  { type: 'function', name: 'latestRound', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'seed', stateMutability: 'nonpayable', inputs: [{ type: 'int256[]' }, { type: 'uint64[]' }], outputs: [] },
  { type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
  { type: 'function', name: 'set', stateMutability: 'nonpayable', inputs: [{ type: 'int256' }], outputs: [] },
];

const status = { startedAt: Date.now(), keeper: { lastTick: 0, executed: 0, lastError: null }, prices: { enabled: false, lastTick: 0 }, drip: { enabled: false, sent: 0 } };

// ---------------------------------------------------------------- keeper
const keeper = walletFor(env.KEEPER_PRIVATE_KEY);
async function runReady(lengthFn, readyFn, execFn) {
  const n = await pub.readContract({ address: BROKER, abi: brokerAbi, functionName: lengthFn });
  let done = 0;
  for (let id = 0n; id < n; id++) {
    const ready = await pub.readContract({ address: BROKER, abi: brokerAbi, functionName: readyFn, args: [id] });
    if (!ready) continue;
    try {
      const { request } = await pub.simulateContract({ address: BROKER, abi: brokerAbi, functionName: execFn, args: [id], account: keeper.account });
      const hash = await keeper.writeContract(request);
      const r = await pub.waitForTransactionReceipt({ hash });
      log('keeper', `${execFn}(${id}) ${r.status} ${hash}`);
      done++;
    } catch (e) { log('keeper', `${execFn}(${id}) failed: ${reason(e)}`); }
  }
  return done;
}
async function keeperTick() {
  try {
    const a = await runReady('plansLength', 'planReady', 'executePlan');
    const b = await runReady('ordersLength', 'orderReady', 'fillOrder');
    status.keeper.executed += a + b; status.keeper.lastTick = Date.now(); status.keeper.lastError = null;
  } catch (e) { status.keeper.lastError = reason(e); log('keeper', 'tick failed:', reason(e)); }
}

// ---------------------------------------------------------------- prices
let feeds = [];
async function loadFeeds() {
  const assets = await pub.readContract({ address: BROKER, abi: brokerAbi, functionName: 'listAssets' });
  feeds = [];
  for (const a of assets) {
    const [feed] = await pub.readContract({ address: BROKER, abi: brokerAbi, functionName: 'assets', args: [a] });
    const [, answer] = await pub.readContract({ address: feed, abi: feedAbi, functionName: 'latestRoundData' });
    const symbol = await pub.readContract({ address: a, abi: erc20Abi, functionName: 'symbol' }).catch(() => '?');
    feeds.push({ asset: a, symbol, feed, anchor: Number(answer), last: Number(answer), pushedAt: 0 });
  }
}
function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const SOURCE = env.PRICE_SOURCE || (env.MARKET_SIM === '1' ? 'sim' : 'hold');
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/';
async function yahoo(symbol, interval, range) {
  const r = await fetch(`${YAHOO}${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`, { headers: { 'user-agent': 'Mozilla/5.0 GiFTED-relayer' } });
  if (!r.ok) throw new Error(`price source HTTP ${r.status}`);
  const j = (await r.json()).chart.result[0];
  const closes = j.indicators?.quote?.[0]?.close ?? [];
  return { price: j.meta.regularMarketPrice, points: (j.timestamp ?? []).map((t, i) => [t, closes[i]]).filter(([, c]) => c) };
}
const to8 = (usd) => BigInt(Math.round(usd * 1e8));

async function seedHistory(wallet) {
  const block = await pub.getBlock();
  for (const f of feeds) {
    const rounds = await pub.readContract({ address: f.feed, abi: feedAbi, functionName: 'latestRound' });
    if (rounds > 20n) continue; // already has history
    try {
      const [d, h, m] = await Promise.all([yahoo(f.symbol, '1d', '3mo'), yahoo(f.symbol, '30m', '5d'), yahoo(f.symbol, '5m', '1d')]);
      const cutoffH = h.points[0]?.[0] ?? Infinity, cutoffM = m.points[0]?.[0] ?? Infinity;
      const pts = [...d.points.filter(([t]) => t < cutoffH), ...h.points.filter(([t]) => t < cutoffM), ...m.points]
        .filter(([t]) => t < Number(block.timestamp) - 5).sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < pts.length; i += 150) {
        const chunk = pts.slice(i, i + 150);
        const hash = await wallet.writeContract({ address: f.feed, abi: feedAbi, functionName: 'seed', args: [chunk.map(([, c]) => to8(c)), chunk.map(([t]) => BigInt(t))] });
        await pub.waitForTransactionReceipt({ hash });
      }
      log('prices', `${f.symbol}: backfilled ${pts.length} real price points`);
    } catch (e) { log('prices', `${f.symbol}: history backfill failed: ${reason(e)}`); }
  }
}

async function priceTick(wallet) {
  for (const f of feeds) {
    const [, answer] = await pub.readContract({ address: f.feed, abi: feedAbi, functionName: 'latestRoundData' });
    const cur = Number(answer);
    let next = cur;
    if (SOURCE === 'sim') {
      const revert = (f.anchor - cur) / f.anchor * 0.002; // very gentle pull back toward the anchor
      next = Math.round(cur * (1 + revert + gauss() * 0.0012));
    } else if (SOURCE === 'live') {
      try { next = Number(to8((await yahoo(f.symbol, '1m', '1d')).price)); } catch (e) { log('prices', `${f.symbol}: ${reason(e)}`); }
      // Push when the price moved, and at least every 10 minutes so the feed never goes stale.
      if (next === cur && Date.now() - f.pushedAt < 600_000) continue;
    }
    try { const hash = await wallet.writeContract({ address: f.feed, abi: feedAbi, functionName: 'set', args: [BigInt(Math.max(1, next))] }); await pub.waitForTransactionReceipt({ hash }); f.last = next; f.pushedAt = Date.now(); }
    catch (e) { log('prices', `set failed for ${f.feed}: ${reason(e)}`); }
  }
  status.prices.lastTick = Date.now();
}

// ---------------------------------------------------------------- gas sponsor
const dripWallet = env.DRIP_PRIVATE_KEY ? walletFor(env.DRIP_PRIVATE_KEY) : null;
const DRIP = parseEther(env.DRIP_ETH || '0.002');
const DRIP_MIN = parseEther(env.DRIP_MIN_ETH || '0.0005');
const lastByAddr = new Map(); const hitsByIp = new Map();
async function drip(address, ip) {
  if (!dripWallet) return { status: 503, body: { error: 'Gas sponsorship is not enabled on this server.' } };
  if (!isAddress(address)) return { status: 400, body: { error: 'Invalid address.' } };
  const now = Date.now();
  const hits = (hitsByIp.get(ip) || []).filter((t) => now - t < 3600_000);
  if (hits.length >= 10) return { status: 429, body: { error: 'Too many requests. Try again later.' } };
  hitsByIp.set(ip, [...hits, now]);
  const bal = await pub.getBalance({ address });
  if (bal >= DRIP_MIN) return { status: 200, body: { funded: false, balance: formatEther(bal) } };
  if (now - (lastByAddr.get(address.toLowerCase()) || 0) < 6 * 3600_000) return { status: 429, body: { error: 'This account was topped up recently.' } };
  lastByAddr.set(address.toLowerCase(), now);
  const hash = await dripWallet.sendTransaction({ to: address, value: DRIP });
  await pub.waitForTransactionReceipt({ hash });
  status.drip.sent++;
  log('drip', `sent ${formatEther(DRIP)} ETH to ${address}`);
  return { status: 200, body: { funded: true, hash } };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  try {
    if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, chainId: CHAIN_ID, broker: BROKER, ...status });
    if (req.method === 'POST' && req.url === '/drip') {
      let raw = ''; for await (const c of req) { raw += c; if (raw.length > 2000) break; }
      const { address } = JSON.parse(raw || '{}');
      const r = await drip(address, req.socket.remoteAddress || 'unknown');
      return send(r.status, r.body);
    }
    send(404, { error: 'Not found' });
  } catch (e) { send(500, { error: reason(e) }); }
});

// ---------------------------------------------------------------- start
const loop = (fn, ms) => { let running = false; setInterval(async () => { if (running) return; running = true; try { await fn(); } finally { running = false; } }, ms); };
log('relayer', `broker ${BROKER} on chain ${CHAIN_ID} via ${RPC_URL}`);
log('keeper', `account ${keeper.account.address}, every ${Number(env.KEEPER_INTERVAL_MS || 15000) / 1000}s`);
await keeperTick();
loop(keeperTick, Number(env.KEEPER_INTERVAL_MS || 15000));
if (env.PRICE_PRIVATE_KEY) {
  const pw = walletFor(env.PRICE_PRIVATE_KEY);
  await loadFeeds();
  status.prices.enabled = true; status.prices.source = SOURCE;
  log('prices', `${feeds.length} feeds (${feeds.map((f) => f.symbol).join(', ')}), updater ${pw.account.address}, source: ${SOURCE}`);
  if (env.SEED_HISTORY === '1') await seedHistory(pw);
  await priceTick(pw);
  loop(() => priceTick(pw), Number(env.PRICE_INTERVAL_MS || 60000));
}
if (dripWallet) { status.drip.enabled = true; log('drip', `sponsor ${dripWallet.account.address}, ${formatEther(DRIP)} ETH per new account`); }
const PORT = Number(env.PORT || 8788);
server.listen(PORT, () => log('relayer', `http://localhost:${PORT} (GET /health, POST /drip)`));
