import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Repeat, Plus, Timer } from 'lucide-react';
import { useApp } from '../state';
import { portfolioSeries, portfolioTotals, type Point } from '../lib/data';
import { PriceChart, rangeStart, scrubLabel, type Range } from '../components/Chart';
import { RangeTabs } from '../components/RangeTabs';
import { RollingNumber } from '../components/Motion';
import { Button, Change, SectionTitle, Skeleton, StockLogo } from '../components/ui';
import { StockRow } from '../components/StockRow';
import { GetStarted, TopMovers, NewsFeed } from '../components/HomeExtras';
import { usd, ngn, toNum, e18, frequencyLabel, dateLabel } from '../lib/format';

export function Home() {
  const { market, portfolio, session, open, showNgn } = useApp();
  const [range, setRange] = useState<Range>('1D');
  const [scrub, setScrub] = useState<Point | null>(null);
  const now = market?.chainTime ?? Math.floor(Date.now() / 1000);

  const totals = market && portfolio ? portfolioTotals(market, portfolio) : null;
  const series = useMemo(() => {
    if (!market || !portfolio) return [];
    const first = Math.min(...market.assets.map((a) => a.history[0]?.t ?? now));
    return portfolioSeries(market, portfolio, rangeStart(range, now, first), now, range === '1D' ? 96 : 140);
  }, [market, portfolio, range, now]);
  const start = series[0]?.v ?? 0;
  const shown = scrub ?? series.at(-1);
  const delta = shown ? shown.v - start : 0;
  const up = (scrub ? delta : range === '1D' ? totals?.today ?? 0 : delta) >= 0;

  const held = market && portfolio ? market.assets.filter((a) => (portfolio.holdings[a.address]?.balance ?? 0n) > 0n) : [];
  const empty = totals !== null && totals.total < 0.005 && held.length === 0;
  const plans = portfolio?.plans.filter((p) => !p.ended) ?? [];
  const orders = portfolio?.orders.filter((o) => o.status === 'open') ?? [];
  const bySym = (addr: string) => market?.assets.find((a) => a.address.toLowerCase() === addr.toLowerCase());
  const bp = market && portfolio ? toNum(portfolio.buyingPower, market.stableDecimals) : null;

  return (
    <div className="grid gap-10 pt-6 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <div className="text-sm font-medium text-muted">{session?.profile.name ? `Hi ${session.profile.name}` : 'Investing'}</div>
        {totals ? (
          <>
            <div className="text-[36px] font-semibold leading-tight tracking-[-0.02em]"><RollingNumber value={usd(scrub ? scrub.v : totals.total)} testId="portfolio-value" /></div>
            {showNgn && ngn(totals.total) && !scrub && <div className="text-sm text-muted">{ngn(totals.total)}</div>}
            {!empty && (scrub
              ? <Change value={delta} pctValue={start ? delta / start : 0} suffix={scrubLabel(scrub.t, range)} />
              : range === '1D' ? <Change value={totals.today} pctValue={totals.todayPct} suffix="Today" />
              : <Change value={delta} pctValue={start ? delta / start : 0} suffix={{ '1W': 'Past week', '1M': 'Past month', '3M': 'Past 3 months', ALL: 'All time' }[range as Exclude<Range, '1D'>]} />)}
          </>
        ) : <><Skeleton className="h-12 w-56" /><Skeleton className="mt-2 h-5 w-40" /></>}

        {!empty && held.length === 0 && market && portfolio ? (
          <GetStarted />
        ) : empty ? (
          <div className="mt-8 rounded-3xl bg-bg-2 p-6 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight">Add money to start investing</h2>
            <p className="mt-2 max-w-md text-muted">Move digital dollars into your account, then buy any stock from $1. Your money stays yours and you can withdraw anytime.</p>
            <Button className="mt-5" onClick={() => open({ type: 'add' })}><Plus className="size-4" /> Add money</Button>
          </div>
        ) : (
          <div className="mt-4">
            <div className="-mx-1"><PriceChart points={series} color={up ? 'var(--up)' : 'var(--down)'} onScrub={setScrub} baseline={range === '1D' ? start : undefined} /></div>
            <div className="relative mt-2"><RangeTabs value={range} onChange={setRange} up={up} />
              <span className="absolute right-0 top-2.5 hidden text-xs text-faint sm:block">Based on current holdings</span></div>
          </div>
        )}

        <button onClick={() => open({ type: 'buying-power' })} className="mt-2 flex w-full items-center justify-between border-b border-line py-4 text-left" data-testid="buying-power">
          <span className="font-medium">Buying power</span>
          <span className="num flex items-center gap-1 font-semibold">{bp !== null ? usd(bp) : <Skeleton className="h-5 w-20" />}<ChevronRight className="size-4 text-muted" /></span>
        </button>

        {held.length > 0 && <GetStarted compact />}

        {(plans.length > 0 || orders.length > 0) && (
          <>
            <SectionTitle>Scheduled</SectionTitle>
            <div className="divide-y divide-line">
              {plans.map((p) => { const a = bySym(p.asset); if (!a) return null; return (
                <button key={`p${p.id}`} onClick={() => open({ type: 'plan', id: String(p.id) })} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className="grid size-10 place-items-center rounded-full bg-up-soft text-up"><Repeat className="size-5" /></span>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{usd(toNum(p.amount, market!.stableDecimals))} of {a.symbol} · {frequencyLabel(p.interval).toLowerCase()}</div>
                    <div className="text-sm text-muted">{p.active ? `Next: ${dateLabel(p.nextAt < now ? now : p.nextAt)}` : 'Paused'}</div></div>
                  <ChevronRight className="size-4 text-muted" />
                </button>); })}
              {orders.map((o) => { const a = bySym(o.asset); if (!a) return null; return (
                <button key={`o${o.id}`} onClick={() => open({ type: 'order', id: String(o.id) })} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className="grid size-10 place-items-center rounded-full bg-bg-2 text-muted"><Timer className="size-5" /></span>
                  <div className="min-w-0 flex-1"><div className="font-semibold">Limit buy {a.symbol} at {usd(e18(o.limitPriceE18))}</div>
                    <div className="text-sm text-muted">{usd(toNum(o.amount, market!.stableDecimals))} set aside · {o.expiry < now ? 'Expired' : `Good till ${new Date(o.expiry * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}</div></div>
                  <ChevronRight className="size-4 text-muted" />
                </button>); })}
            </div>
          </>
        )}

        {held.length > 0 && (
          <>
            <SectionTitle>Your stocks</SectionTitle>
            <div data-testid="holdings">{held.map((a) => <StockRow key={a.symbol} asset={a} now={now} sharesHeld={e18(portfolio!.holdings[a.address].balance)} />)}</div>
          </>
        )}

        {market && <TopMovers assets={market.assets} />}
        {market && <div className="mt-2"><NewsFeed assets={market.assets} /></div>}

        <div className="lg:hidden">
          <SectionTitle action={<Link to="/invest" className="text-sm font-semibold text-up">See all</Link>}>{held.length ? 'Discover' : 'Popular stocks'}</SectionTitle>
          {market ? market.assets.map((a) => <StockRow key={a.symbol} asset={a} now={now} right="change" />) : <Skeleton className="h-40 w-full" />}
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24 rounded-3xl border border-line p-5">
          <div className="flex items-center justify-between"><h2 className="font-bold">Stock Tokens</h2><Link to="/invest" className="text-sm font-semibold text-up">See all</Link></div>
          <div className="mt-2">{market ? market.assets.map((a) => <StockRow key={a.symbol} asset={a} now={now} right="change" />) : <Skeleton className="h-60 w-full" />}</div>
          <div className="mt-4 rounded-2xl bg-bg-2 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold"><Repeat className="size-4 text-up" /> Invest on autopilot</div>
            <p className="mt-1 text-muted">Set a weekly amount for any stock and we’ll buy it for you, even while you sleep.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function Invest() {
  const { market } = useApp();
  const [q, setQ] = useState('');
  const now = market?.chainTime ?? 0;
  const list = (market?.assets ?? []).filter((a) => (a.symbol + a.name + a.sector).toLowerCase().includes(q.toLowerCase()));
  const movers = [...(market?.assets ?? [])].sort((a, b) => Math.abs(b.changePct24h) - Math.abs(a.changePct24h)).slice(0, 3);
  return (
    <div className="mx-auto max-w-2xl pt-6">
      <h1 className="text-3xl font-bold tracking-tight">Invest</h1>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or ticker" aria-label="Search stocks"
        className="mt-4 h-12 w-full rounded-2xl bg-bg-2 px-4 outline-none focus:ring-2 focus:ring-up/40" />
      {!q && market && (
        <>
          <SectionTitle>Top movers today</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            {movers.map((a) => (
              <Link key={a.symbol} to={`/stocks/${a.symbol}`} className="rounded-2xl border border-line p-3 hover:bg-bg-2">
                <StockLogo symbol={a.symbol} color={a.color} size={32} />
                <div className="mt-2 font-semibold">{a.symbol}</div>
                <div className={`num text-sm font-semibold ${a.change24h >= 0 ? 'text-up' : 'text-down'}`}>{a.change24h >= 0 ? '+' : '−'}{Math.abs(a.changePct24h * 100).toFixed(2)}%</div>
              </Link>
            ))}
          </div>
        </>
      )}
      <SectionTitle>{q ? 'Results' : 'All Stock Tokens'}</SectionTitle>
      {market ? list.map((a) => <StockRow key={a.symbol} asset={a} now={now} />) : <Skeleton className="h-60 w-full" />}
      {market && !list.length && <p className="py-8 text-center text-muted">No stocks match “{q}”.</p>}
      <p className="mt-8 text-xs text-faint">More Stock Tokens are added as they launch on Robinhood Chain. Prices update 24/5 during US market sessions; you can place orders any time.</p>
    </div>
  );
}
