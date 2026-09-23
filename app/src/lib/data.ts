import { useQuery, useQueryClient } from '@tanstack/react-query';
import { maxUint256, type Address } from 'viem';
import { brokerAbi, erc20Abi, feedAbi } from './abi';
import { brokerAddress, startBlock, STOCK_INFO } from './config';
import { publicClient, triggerTick } from './chain';
import { e18, toNum } from './format';

const B = brokerAddress!;
const read = <T,>(address: Address, abi: any, functionName: string, args: any[] = []) => publicClient.readContract({ address, abi, functionName, args }) as Promise<T>;

export interface Point { t: number; v: number }
export interface Asset {
  address: Address; symbol: string; name: string; color: string; about: string; sector: string;
  feed: Address; maxAge: number; enabled: boolean;
  price: number | null; priceOk: boolean; updatedAt: number;
  history: Point[]; open24h: number | null; change24h: number; changePct24h: number;
}
export interface Market {
  assets: Asset[]; stable: Address; stableDecimals: number; stableSymbol: string; stableFaucet: bigint | null;
  paused: boolean; sequencerLive: boolean; feeBps: number; chainTime: number; tradingLive: boolean;
}

// ---------------------------------------------------------------- market
const meta = new Map<Address, { symbol: string; feed: Address; maxAge: number; enabled: boolean }>();
let stableMeta: { stable: Address; stableDecimals: number; stableSymbol: string; stableFaucet: bigint | null } | null = null;

async function loadHistory(feed: Address): Promise<Point[]> {
  try {
    const [answers, times] = await read<[bigint[], bigint[]]>(feed, feedAbi, 'history', [1000n]);
    return answers.map((a, i) => ({ t: Number(times[i]), v: Number(a) / 1e8 }));
  } catch {
    // Standard Chainlink feeds: sample recent rounds.
    const latest = await read<bigint>(feed, feedAbi, 'latestRound').catch(() => 0n);
    if (!latest) return [];
    const ids: bigint[] = []; for (let i = 0n; i < 60n && latest - i * 4n > 0n; i++) ids.unshift(latest - i * 4n);
    const rounds = await Promise.all(ids.map((id) => read<any[]>(feed, feedAbi, 'getRoundData', [id]).catch(() => null)));
    return rounds.filter(Boolean).map((r: any) => ({ t: Number(r[3]), v: Number(r[1]) / 1e8 }));
  }
}

export function priceAt(history: Point[], t: number): number | null {
  if (!history.length || history[0].t > t) return history[0]?.v ?? null;
  let lo = 0, hi = history.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (history[mid].t <= t) lo = mid; else hi = mid - 1; }
  return history[lo].v;
}

export async function fetchMarket(): Promise<Market> {
  if (!stableMeta) {
    const stable = await read<Address>(B, brokerAbi, 'stable');
    const [stableDecimals, stableSymbol, stableFaucet] = await Promise.all([read<number>(B, brokerAbi, 'stableDecimals'), read<string>(stable, erc20Abi, 'symbol').catch(() => 'USD'), read<bigint>(stable, erc20Abi, 'faucetAmount').catch(() => null)]);
    stableMeta = { stable, stableDecimals: Number(stableDecimals), stableSymbol, stableFaucet };
  }
  const [list, paused, sequencerLive, feeBps, block] = await Promise.all([
    read<Address[]>(B, brokerAbi, 'listAssets'), read<boolean>(B, brokerAbi, 'paused'), read<boolean>(B, brokerAbi, 'sequencerLive'), read<bigint>(B, brokerAbi, 'feeBps'), publicClient.getBlock(),
  ]);
  const chainTime = Number(block.timestamp);
  const assets = await Promise.all(list.map(async (address): Promise<Asset> => {
    if (!meta.has(address)) {
      const [symbol, cfg] = await Promise.all([read<string>(address, erc20Abi, 'symbol'), read<[Address, number, boolean]>(B, brokerAbi, 'assets', [address])]);
      meta.set(address, { symbol, feed: cfg[0], maxAge: Number(cfg[1]), enabled: cfg[2] });
    }
    const m = meta.get(address)!;
    const [[priceE18, updatedAt, ok], history] = await Promise.all([read<[bigint, bigint, boolean]>(B, brokerAbi, 'priceOf', [address]), loadHistory(m.feed)]);
    const info = STOCK_INFO[m.symbol] || { name: m.symbol, color: '#4b5563', about: '', sector: '' };
    const price = priceE18 > 0n ? e18(priceE18) : history.at(-1)?.v ?? null;
    const open24h = priceAt(history, chainTime - 86400);
    const change24h = price !== null && open24h ? price - open24h : 0;
    return { address, symbol: m.symbol, ...info, feed: m.feed, maxAge: m.maxAge, enabled: m.enabled, price, priceOk: ok, updatedAt: Number(updatedAt), history, open24h, change24h, changePct24h: open24h ? change24h / open24h : 0 };
  }));
  if (assets.some((a) => chainTime - a.updatedAt > 90)) triggerTick(); // prices getting old: ask the relayer to refresh
  return { assets, ...stableMeta, paused, sequencerLive, feeBps: Number(feeBps), chainTime, tradingLive: !paused && sequencerLive };
}

export const useMarket = () => useQuery({ queryKey: ['market'], queryFn: fetchMarket, refetchInterval: 10000, enabled: !!brokerAddress });

// ---------------------------------------------------------------- portfolio
export interface PlanView { id: bigint; asset: Address; amount: bigint; maxPriceE18: bigint; interval: number; nextAt: number; runs: number; active: boolean; ended: boolean }
export interface OrderView { id: bigint; asset: Address; amount: bigint; limitPriceE18: bigint; expiry: number; createdAt: number; status: 'open' | 'filled' | 'cancelled' }
export interface Portfolio {
  buyingPower: bigint; walletStable: bigint; stableAllowance: bigint; eth: bigint;
  holdings: Record<Address, { balance: bigint; allowance: bigint }>;
  plans: PlanView[]; orders: OrderView[]; reserved: bigint;
}

export async function fetchPortfolio(user: Address, market: Market): Promise<Portfolio> {
  const [buyingPower, walletStable, stableAllowance, eth, plansRes, ordersRes, holdingsArr] = await Promise.all([
    read<bigint>(B, brokerAbi, 'balances', [user]),
    read<bigint>(market.stable, erc20Abi, 'balanceOf', [user]),
    read<bigint>(market.stable, erc20Abi, 'allowance', [user, B]),
    publicClient.getBalance({ address: user }),
    read<[bigint[], any[]]>(B, brokerAbi, 'plansOf', [user]),
    read<[bigint[], any[]]>(B, brokerAbi, 'ordersOf', [user]),
    Promise.all(market.assets.map(async (a) => [a.address, { balance: await read<bigint>(a.address, erc20Abi, 'balanceOf', [user]), allowance: await read<bigint>(a.address, erc20Abi, 'allowance', [user, B]) }] as const)),
  ]);
  const plans: PlanView[] = plansRes[1].map((p, i) => ({ id: plansRes[0][i], asset: p.asset, amount: p.amount, maxPriceE18: p.maxPriceE18, interval: Number(p.interval), nextAt: Number(p.nextAt), runs: Number(p.runs), active: p.active, ended: p.ended })).reverse();
  const statusOf = (s: number): OrderView['status'] => (s === 1 ? 'open' : s === 2 ? 'filled' : 'cancelled');
  const orders: OrderView[] = ordersRes[1].map((o, i) => ({ id: ordersRes[0][i], asset: o.asset, amount: o.amount, limitPriceE18: o.limitPriceE18, expiry: Number(o.expiry), createdAt: Number(o.createdAt), status: statusOf(Number(o.status)) })).reverse();
  const reserved = orders.filter((o) => o.status === 'open').reduce((s, o) => s + o.amount, 0n);
  return { buyingPower, walletStable, stableAllowance, eth, holdings: Object.fromEntries(holdingsArr), plans, orders, reserved };
}

export function usePortfolio(user: Address | undefined, market: Market | undefined) {
  return useQuery({ queryKey: ['portfolio', user], queryFn: () => fetchPortfolio(user!, market!), enabled: !!user && !!market, refetchInterval: 10000 });
}

// ---------------------------------------------------------------- activity
export type ActivityKind = 'deposit' | 'withdraw' | 'buy' | 'sell' | 'plan-created' | 'plan-ended' | 'plan-paused' | 'plan-resumed' | 'order-placed' | 'order-cancelled';
export interface ActivityItem { key: string; kind: ActivityKind; time: number; txHash: `0x${string}`; asset?: Address; amount?: bigint; shares?: bigint; fee?: bigint; priceE18?: bigint; source?: 'instant' | 'recurring' | 'limit'; refId?: bigint; limitPriceE18?: bigint; interval?: number }

const ev = (name: string) => (brokerAbi as readonly any[]).find((x) => x.type === 'event' && x.name === name);
const times = new Map<bigint, Promise<number>>();
const blockTime = (n: bigint) => { if (!times.has(n)) times.set(n, publicClient.getBlock({ blockNumber: n }).then((b) => Number(b.timestamp))); return times.get(n)!; };

export async function fetchActivity(user: Address): Promise<ActivityItem[]> {
  const q = (name: string) => publicClient.getLogs({ address: B, event: ev(name), args: { user } as any, fromBlock: startBlock, toBlock: 'latest' }).catch(() => [] as any[]);
  const [dep, wd, pc, pe, pp, oc, ox, bo, so] = await Promise.all(['Deposited', 'Withdrawn', 'PlanCreated', 'PlanCancelled', 'PlanPaused', 'OrderCreated', 'OrderCancelled', 'Bought', 'Sold'].map(q));
  const items: Omit<ActivityItem, 'time'>[] & { blockNumber?: bigint }[] = [];
  const base = (l: any) => ({ key: `${l.transactionHash}-${l.logIndex}`, txHash: l.transactionHash, blockNumber: l.blockNumber });
  dep.forEach((l: any) => items.push({ ...base(l), kind: 'deposit', amount: l.args.amount }));
  wd.forEach((l: any) => items.push({ ...base(l), kind: 'withdraw', amount: l.args.amount }));
  pc.forEach((l: any) => items.push({ ...base(l), kind: 'plan-created', asset: l.args.asset, amount: l.args.amount, interval: Number(l.args.interval), refId: l.args.id }));
  pe.forEach((l: any) => items.push({ ...base(l), kind: 'plan-ended', refId: l.args.id }));
  pp.forEach((l: any) => items.push({ ...base(l), kind: l.args.paused ? 'plan-paused' : 'plan-resumed', refId: l.args.id }));
  oc.forEach((l: any) => items.push({ ...base(l), kind: 'order-placed', asset: l.args.asset, amount: l.args.amount, limitPriceE18: l.args.limitPriceE18, refId: l.args.id }));
  ox.forEach((l: any) => items.push({ ...base(l), kind: 'order-cancelled', refId: l.args.id }));
  bo.forEach((l: any) => items.push({ ...base(l), kind: 'buy', asset: l.args.asset, amount: l.args.spent, shares: l.args.received, fee: l.args.fee, priceE18: l.args.priceE18, refId: l.args.refId, source: (['instant', 'recurring', 'limit'] as const)[Number(l.args.source)] }));
  so.forEach((l: any) => items.push({ ...base(l), kind: 'sell', asset: l.args.asset, amount: l.args.proceeds, shares: l.args.assetIn, fee: l.args.fee, priceE18: l.args.priceE18 }));
  const withTime = await Promise.all(items.map(async (i: any) => ({ ...i, time: await blockTime(i.blockNumber) })));
  return withTime.sort((a, b) => b.time - a.time || (b.key > a.key ? 1 : -1));
}

export const useActivity = (user: Address | undefined) => useQuery({ queryKey: ['activity', user], queryFn: () => fetchActivity(user!), enabled: !!user, refetchInterval: 8000 });

export function useReady(kind: 'plan' | 'order', id: bigint | undefined) {
  return useQuery({ queryKey: ['ready', kind, String(id)], enabled: id !== undefined, refetchInterval: 3000,
    queryFn: () => read<boolean>(B, brokerAbi, kind === 'plan' ? 'planReady' : 'orderReady', [id!]) });
}

// ---------------------------------------------------------------- derived
export interface Position { shares: number; value: number; avgCost: number | null; totalReturn: number | null; todayReturn: number; diversity: number }

export function positionFor(asset: Asset, balance: bigint, activity: ActivityItem[] | undefined, portfolioValue: number, stableDecimals: number): Position {
  const shares = e18(balance);
  const price = asset.price ?? 0;
  let costShares = 0, cost = 0;
  for (const a of [...(activity || [])].reverse()) {
    if (a.asset?.toLowerCase() !== asset.address.toLowerCase()) continue;
    if (a.kind === 'buy') { costShares += e18(a.shares!); cost += toNum(a.amount!, stableDecimals); }
    if (a.kind === 'sell' && costShares > 0) { const s = Math.min(e18(a.shares!), costShares); cost -= cost * (s / costShares); costShares -= s; }
  }
  const avgCost = costShares > 1e-9 ? cost / costShares : null;
  return {
    shares, value: shares * price, avgCost,
    totalReturn: avgCost !== null ? shares * (price - avgCost) : null,
    todayReturn: shares * asset.change24h,
    diversity: portfolioValue > 0 ? (shares * price) / portfolioValue : 0,
  };
}

export function portfolioTotals(market: Market, p: Portfolio) {
  const cash = toNum(p.buyingPower + p.reserved, market.stableDecimals);
  let invested = 0, today = 0;
  for (const a of market.assets) { const s = e18(p.holdings[a.address]?.balance ?? 0n); invested += s * (a.price ?? 0); today += s * a.change24h; }
  const total = invested + cash;
  return { total, invested, cash, today, todayPct: total - today > 0 ? today / (total - today) : 0 };
}

/** Portfolio value over time using today's holdings (a common simplification, noted in the UI). */
export function portfolioSeries(market: Market, p: Portfolio, from: number, to: number, points = 120): Point[] {
  const cash = toNum(p.buyingPower + p.reserved, market.stableDecimals);
  const held = market.assets.map((a) => ({ a, s: e18(p.holdings[a.address]?.balance ?? 0n) })).filter((x) => x.s > 0);
  const out: Point[] = [];
  for (let i = 0; i <= points; i++) {
    const t = from + ((to - from) * i) / points;
    out.push({ t, v: cash + held.reduce((sum, { a, s }) => sum + s * (priceAt(a.history, t) ?? a.price ?? 0), 0) });
  }
  return out;
}

export const needsApproval = (allowance: bigint, amount: bigint) => allowance < amount;
export const MAX = maxUint256;
export function useRefresh() { const qc = useQueryClient(); return () => qc.invalidateQueries(); }
