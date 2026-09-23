import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Repeat, Timer, ChevronRight, Info } from 'lucide-react';
import { useApp } from '../state';
import { positionFor, portfolioTotals, type Point } from '../lib/data';
import { PriceChart, sliceRange, scrubLabel, type Range } from '../components/Chart';
import { RangeTabs } from '../components/RangeTabs';
import { RollingNumber } from '../components/Motion';
import { Button, Change, Notice, Skeleton, StockLogo } from '../components/ui';
import { TradeFlow } from '../flows/TradeFlow';
import { usd, pct, signedUsd, shares as fmtShares, toNum, e18, frequencyLabel, dateLabel, ago, short } from '../lib/format';
import { explorerUrl, chain } from '../lib/config';
import { useMedia } from '../lib/useMedia';

const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mb-5 mt-12 border-b border-line pb-4 text-[24px] font-medium tracking-[-0.01em]">{children}</h2>;
const KV = ({ items, cols = 4 }: { items: [string, React.ReactNode][]; cols?: number }) => (
  <dl className={`grid grid-cols-2 gap-x-6 gap-y-6 ${cols === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
    {items.map(([l, v]) => <div key={l}><dt className="text-[13px] font-semibold">{l}</dt><dd className="num mt-2 text-[15px]">{v}</dd></div>)}
  </dl>
);

/** Signed-out order card: same rows, but the action is to sign up. */
function PublicOrderCard({ symbol, price }: { symbol: string; price: number }) {
  return (
    <div data-testid="public-order-card">
      <div className="-mx-5 -mt-5 border-b border-line px-5 py-4 text-[17px] font-semibold">Buy {symbol}</div>
      {[['Order type', 'Market order'], ['Amount', '$0.00'], ['Market price', usd(price)], ['Fee', 'Shown before you confirm']].map(([l, v]) => (
        <div key={l} className="flex justify-between py-2.5 text-[15px]"><span className="text-muted">{l}</span><span className="num font-medium">{v}</span></div>
      ))}
      <div className="mt-2 flex justify-between border-t border-line pt-4 text-[15px] font-semibold"><span>Estimated cost</span><span className="num">$0.00</span></div>
      <p className="mt-5 text-[13px] leading-relaxed text-muted">Create a GiFTED! account to buy {symbol} Stock Tokens from $1 with digital dollars. It takes under a minute with a passkey.</p>
      <Link to="/signup" className="mt-5 flex h-12 items-center justify-center rounded-full bg-up text-[15px] font-semibold text-on-up">Sign up to buy</Link>
      <Link to="/login" className="mt-3 block text-center text-[13px] font-semibold text-up">Already have an account? Log in</Link>
    </div>
  );
}

export function Stock() {
  const { symbol = '' } = useParams();
  const { market, portfolio, activity, open, session } = useApp();
  const [range, setRange] = useState<Range>('1D');
  const [scrub, setScrub] = useState<Point | null>(null);
  const [panelKey, setPanelKey] = useState(0);
  const desktop = useMedia('(min-width: 1024px)');
  const asset = market?.assets.find((a) => a.symbol === symbol.toUpperCase());
  const now = market?.chainTime ?? 0;
  const points = useMemo(() => (asset ? sliceRange(asset.history, range, now) : []), [asset, range, now]);

  if (!market) return <div className="pt-8"><Skeleton className="h-10 w-48" /><Skeleton className="mt-4 h-64 w-full" /></div>;
  if (!asset) return <div className="py-20 text-center"><p className="text-lg font-semibold">We couldn’t find “{symbol}”.</p><Link to="/invest" className="mt-4 inline-block font-semibold text-up">Browse stocks</Link></div>;

  const first = points[0]?.v ?? asset.price ?? 0;
  const shownV = scrub?.v ?? asset.price ?? points.at(-1)?.v ?? 0;
  const delta = range === '1D' && !scrub ? asset.change24h : shownV - first;
  const deltaPct = range === '1D' && !scrub ? asset.changePct24h : first ? delta / first : 0;
  const up = delta >= 0;
  const held = portfolio?.holdings[asset.address]?.balance ?? 0n;
  const totals = portfolio && market ? portfolioTotals(market, portfolio) : null;
  const pos = portfolio && held > 0n ? positionFor(asset, held, activity, totals?.total ?? 0, market.stableDecimals) : null;
  const plans = portfolio?.plans.filter((p) => !p.ended && p.asset.toLowerCase() === asset.address.toLowerCase()) ?? [];
  const orders = portfolio?.orders.filter((o) => o.status === 'open' && o.asset.toLowerCase() === asset.address.toLowerCase()) ?? [];
  const day = sliceRange(asset.history, '1D', now).map((p) => p.v);
  const all = asset.history.map((p) => p.v);
  const hi = day.length ? Math.max(...day) : null, lo = day.length ? Math.min(...day) : null;
  const age = now - asset.updatedAt;
  const price = asset.price ?? 0;

  return (
    <div className="grid gap-10 pb-28 pt-6 lg:grid-cols-[1fr_340px] lg:gap-14 lg:pb-16">
      <div className="min-w-0">
        <Link to="/" className="-ml-2 mb-2 inline-grid size-10 place-items-center rounded-full hover:bg-bg-2 lg:hidden" aria-label="Back"><ChevronLeft className="size-5" /></Link>
        <div className="flex items-center gap-3"><h1 className="text-[32px] font-medium leading-10 tracking-[-0.01em]">{asset.name}</h1><StockLogo symbol={asset.symbol} color={asset.color} size={28} /></div>
        <div className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.01em]"><RollingNumber value={usd(shownV)} testId="stock-price" /></div>
        <div className="mt-1 text-[15px]"><Change value={delta} pctValue={deltaPct} suffix={scrub ? scrubLabel(scrub.t, range) : range === '1D' ? 'Today' : { '1W': 'Past week', '1M': 'Past month', '3M': 'Past 3 months', ALL: 'All time' }[range as Exclude<Range, '1D'>]} /></div>
        <div className="mt-2 text-[13px] font-semibold">{asset.priceOk ? <span className="inline-flex items-center gap-1.5"><span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-up opacity-60" /><span className="relative size-2 rounded-full bg-up" /></span>24 Hour Market · updated {ago(age)}</span> : <span className="text-warn">Prices paused · last update {ago(age)}</span>}</div>

        <div className="-mx-1 mt-6"><PriceChart points={points} color={up ? 'var(--up)' : 'var(--down)'} height={300} onScrub={setScrub} baseline={range === '1D' ? asset.open24h ?? undefined : undefined} /></div>
        <div className="mt-3"><RangeTabs value={range} onChange={setRange} up={up} /></div>

        {!asset.priceOk && <div className="mt-6"><Notice icon={<Info className="size-4 shrink-0" />}>Live prices are paused, usually because the US market is closed or data is delayed. You can still place limit orders and recurring investments. They go through when prices resume.</Notice></div>}

        {pos && (
          <div className="mt-10 grid gap-4 sm:grid-cols-2" data-testid="position">
            <div className="rounded-xl border border-line p-5">
              <div className="text-[13px] font-semibold text-muted">Your market value</div>
              <div className="num mt-1 text-[28px] font-semibold tracking-tight">{usd(pos.value)}</div>
              <div className="mt-4 space-y-2 text-[15px]">
                <div className="flex justify-between"><span className="text-muted">Today’s return</span><span className={`num ${pos.todayReturn >= 0 ? 'text-up' : 'text-down'}`}>{signedUsd(pos.todayReturn)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Total return</span><span className={`num ${(pos.totalReturn ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>{pos.totalReturn !== null ? `${signedUsd(pos.totalReturn)} (${pct(pos.avgCost ? pos.totalReturn / (pos.avgCost * pos.shares) : 0)})` : '—'}</span></div>
              </div>
            </div>
            <div className="rounded-xl border border-line p-5">
              <div className="text-[13px] font-semibold text-muted">Your average cost</div>
              <div className="num mt-1 text-[28px] font-semibold tracking-tight">{pos.avgCost !== null ? usd(pos.avgCost) : '—'}</div>
              <div className="mt-4 space-y-2 text-[15px]">
                <div className="flex justify-between"><span className="text-muted">Shares</span><span className="num">{fmtShares(pos.shares)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Portfolio diversity</span><span className="num">{(pos.diversity * 100).toFixed(2)}%</span></div>
              </div>
            </div>
          </div>
        )}

        {(plans.length > 0 || orders.length > 0) && (
          <>
            <H2>Scheduled</H2>
            {plans.map((p) => (
              <button key={String(p.id)} onClick={() => open({ type: 'plan', id: String(p.id) })} className="flex w-full items-center gap-3 border-b border-line py-3 text-left hover:bg-bg-2">
                <Repeat className="size-5 text-up" /><div className="flex-1"><div className="font-semibold">{usd(toNum(p.amount, market.stableDecimals))} {frequencyLabel(p.interval).toLowerCase()}</div><div className="text-sm text-muted">{p.active ? `Next: ${dateLabel(Math.max(p.nextAt, now))}` : 'Paused'} · {p.runs} {p.runs === 1 ? 'buy' : 'buys'} so far</div></div><ChevronRight className="size-4 text-muted" />
              </button>
            ))}
            {orders.map((o) => (
              <button key={String(o.id)} onClick={() => open({ type: 'order', id: String(o.id) })} className="flex w-full items-center gap-3 border-b border-line py-3 text-left hover:bg-bg-2">
                <Timer className="size-5 text-muted" /><div className="flex-1"><div className="font-semibold">Limit buy at {usd(e18(o.limitPriceE18))}</div><div className="text-sm text-muted">{usd(toNum(o.amount, market.stableDecimals))} · {o.expiry < now ? 'Expired, cancel to release funds' : 'Good till canceled'}</div></div><ChevronRight className="size-4 text-muted" />
              </button>
            ))}
          </>
        )}

        <H2>About {asset.symbol}</H2>
        <p className="text-[15px] leading-6">{asset.about} <span className="text-muted">{asset.symbol} on GiFTED! is a Stock Token: a token on Robinhood Chain that tracks {asset.name} shares, including splits and dividends. It gives economic exposure, not voting rights.</span></p>
        <div className="mt-8"><KV items={[['Sector', asset.sector || '—'], ['Issuer', 'Robinhood Assets (Jersey)'], ['Network', chain.name], ['Trading', 'Orders 24/7 · prices 24/5']]} /></div>

        <H2>{asset.symbol} Key Statistics</H2>
        <KV items={[
          ['High today', hi !== null ? usd(hi) : '—'], ['Low today', lo !== null ? usd(lo) : '—'], ['Open price', asset.open24h ? usd(asset.open24h) : '—'], ['Last update', ago(age)],
          ['3-month high', all.length ? usd(Math.max(...all)) : '—'], ['3-month low', all.length ? usd(Math.min(...all)) : '—'], ['Token', explorerUrl ? <a className="underline" target="_blank" rel="noopener" href={`${explorerUrl}/token/${asset.address}`}>{short(asset.address)}</a> : short(asset.address)], ['Price feed', short(asset.feed)],
        ]} />

        <H2>Stock Snapshot</H2>
        <div className="space-y-3 text-[15px] leading-6">
          <p>As of now, {asset.name} ({asset.symbol}) Stock Tokens are priced at {usd(price)}, {asset.change24h >= 0 ? 'up' : 'down'} {Math.abs(asset.changePct24h * 100).toFixed(2)}% over the past 24 hours.</p>
          {hi !== null && lo !== null && <p>Over the last day, {asset.symbol} traded between {usd(lo)} and {usd(hi)}. The current price is {(((price - lo) / lo) * 100).toFixed(1)}% above the day’s low and {(((hi - price) / hi) * 100).toFixed(1)}% below its high.</p>}
          {all.length > 0 && <p>Over the past three months, {asset.symbol} reached a high of {usd(Math.max(...all))} and a low of {usd(Math.min(...all))}.</p>}
        </div>
        <p className="mt-10 text-[12px] leading-relaxed text-faint">Prices shown are reference prices from the configured price feed. Stock Tokens are not shares, carry no voting rights and are not offered to US persons.</p>
      </div>

      {desktop && (
        <aside>
          <div className="sticky top-24 space-y-3">
            <div className="rounded-xl border border-line bg-card p-5 shadow-[0_4px_24px_rgba(0,0,0,.06)]" data-testid="order-panel">
              {session ? <TradeFlow key={panelKey} symbol={asset.symbol} inline onClose={() => setPanelKey((k) => k + 1)} /> : <PublicOrderCard symbol={asset.symbol} price={price} />}
            </div>
            {session && <>
              <button onClick={() => open({ type: 'trade', symbol: asset.symbol, side: 'buy', mode: 'recurring' })} className="flex h-12 w-full items-center justify-center rounded-full border border-up text-[15px] font-semibold text-up hover:bg-up-soft">Set up a recurring investment</button>
              <button onClick={() => open({ type: 'add' })} className="flex h-12 w-full items-center justify-center rounded-full border border-up text-[15px] font-semibold text-up hover:bg-up-soft">Add money</button>
            </>}
          </div>
        </aside>
      )}

      {!desktop && (
        <div className="fixed inset-x-0 bottom-[68px] z-20 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:bottom-0">
          <div className="mx-auto flex max-w-6xl gap-3">
            {session ? <>
              {held > 0n && <Button size="lg" variant="secondary" className="flex-1" onClick={() => open({ type: 'trade', symbol: asset.symbol, side: 'sell' })}>Sell</Button>}
              <Button size="lg" variant="up" className="flex-1" onClick={() => open({ type: 'trade', symbol: asset.symbol, side: 'buy' })} data-testid="buy-cta">Buy</Button>
            </> : <Link to="/signup" className="flex h-14 flex-1 items-center justify-center rounded-full bg-up font-semibold text-on-up">Sign up to buy</Link>}
          </div>
        </div>
      )}
    </div>
  );
}
