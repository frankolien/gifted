/**
 * Serverless relayer core for Vercel: the same jobs as server/relayer.js, run on demand.
 *   tick(): push live market prices to feeds that are getting old, then run any ready recurring buys / limit orders.
 *   drip(): top up a new account with a little ETH so users never need gas.
 * Env: BROKER_ADDRESS, RPC_URL, CHAIN_ID, KEEPER_PRIVATE_KEY (also the feed updater), DRIP_PRIVATE_KEY, DRIP_ETH, DRIP_MIN_ETH
 */
import { createPublicClient, createWalletClient, http, defineChain, parseEther, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const env = process.env;
const chain = defineChain({ id: Number(env.CHAIN_ID || 46630), name: 'Robinhood Chain Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com'] } } });
export const pub = createPublicClient({ chain, transport: http() });
const wallet = (key) => createWalletClient({ chain, transport: http(), account: privateKeyToAccount(key) });
const B = env.BROKER_ADDRESS;

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
const feedAbi = [
  { type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
  { type: 'function', name: 'set', stateMutability: 'nonpayable', inputs: [{ type: 'int256' }], outputs: [] },
];
const symAbi = [{ type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] }];
const read = (address, abi, functionName, args = []) => pub.readContract({ address, abi, functionName, args });
const reason = (e) => (e?.shortMessage || e?.message || String(e)).split('\n')[0];

async function livePrice(symbol) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`, { headers: { 'user-agent': 'Mozilla/5.0 GiFTED' } });
  if (!r.ok) throw new Error(`price HTTP ${r.status}`);
  return (await r.json()).chart.result[0].meta.regularMarketPrice;
}

export async function tick({ maxAgeSec = 60 } = {}) {
  const w = wallet(env.KEEPER_PRIVATE_KEY);
  let nonce = await pub.getTransactionCount({ address: w.account.address, blockTag: 'pending' });
  const send = async (address, abi, functionName, args) => {
    const hash = await w.writeContract({ address, abi, functionName, args, nonce: nonce++ });
    return pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
  };
  const out = { prices: [], executed: [] };
  const block = await pub.getBlock();
  const assets = await read(B, brokerAbi, 'listAssets');
  await Promise.all(assets.map(async (a) => {
    const [[feed], symbol] = await Promise.all([read(B, brokerAbi, 'assets', [a]), read(a, symAbi, 'symbol')]);
    const [, answer, , updatedAt] = await read(feed, feedAbi, 'latestRoundData');
    const age = Number(block.timestamp) - Number(updatedAt);
    let next = Number(answer);
    try { next = Math.round((await livePrice(symbol)) * 1e8); } catch (e) { out.prices.push({ symbol, error: reason(e) }); }
    out.prices.push({ symbol, feed, age, next, changed: next !== Number(answer) });
    out._jobs = out._jobs || [];
    if (age > maxAgeSec || next !== Number(answer)) out._jobs.push([feed, next]);
  }));
  for (const [feed, next] of out._jobs || []) { try { await send(feed, feedAbi, 'set', [BigInt(next)]); } catch (e) { out.prices.push({ feed, error: reason(e) }); } }
  delete out._jobs;
  for (const [len, ready, exec] of [['plansLength', 'planReady', 'executePlan'], ['ordersLength', 'orderReady', 'fillOrder']]) {
    const n = await read(B, brokerAbi, len);
    for (let id = 0n; id < n; id++) {
      if (!(await read(B, brokerAbi, ready, [id]))) continue;
      try { const r = await send(B, brokerAbi, exec, [id]); out.executed.push({ fn: exec, id: String(id), status: r.status, tx: r.transactionHash }); }
      catch (e) { out.executed.push({ fn: exec, id: String(id), error: reason(e) }); }
    }
  }
  return out;
}

export async function drip(address) {
  if (!env.DRIP_PRIVATE_KEY) return [503, { error: 'Gas sponsorship is not enabled.' }];
  if (!isAddress(address)) return [400, { error: 'Invalid address.' }];
  const min = parseEther(env.DRIP_MIN_ETH || '0.00002');
  const bal = await pub.getBalance({ address });
  if (bal >= min) return [200, { funded: false }];
  const w = wallet(env.DRIP_PRIVATE_KEY);
  const hash = await w.sendTransaction({ to: address, value: parseEther(env.DRIP_ETH || '0.0001') });
  await pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
  return [200, { funded: true, hash }];
}

export async function health() {
  const assets = await read(B, brokerAbi, 'listAssets');
  const block = await pub.getBlock();
  const ages = await Promise.all(assets.map(async (a) => { const [feed] = await read(B, brokerAbi, 'assets', [a]); const r = await read(feed, feedAbi, 'latestRoundData'); return Number(block.timestamp) - Number(r[3]); }));
  const freshest = Math.min(...ages);
  return { ok: true, chainId: chain.id, broker: B, keeper: { lastTick: Date.now() - freshest * 1000 }, drip: { enabled: !!env.DRIP_PRIVATE_KEY }, prices: { enabled: true, source: 'live' } };
}

export function json(res, code, body) { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(body)); }
