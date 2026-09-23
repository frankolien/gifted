import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Newspaper } from 'lucide-react';
import { useApp } from '../state';
import { useNews, type Asset } from '../lib/data';
import { Sparkline } from './Chart';
import { StockLogo, SectionTitle, Skeleton, cx } from './ui';
import { usd, ago } from '../lib/format';

/** First-run checklist. Each step reflects real on-chain state and links to the action that completes it. */
export function GetStarted({ compact }: { compact?: boolean }) {
  const { portfolio, activity, open } = useApp();
  const nav = useNavigate();
  if (!portfolio || !activity) return null;
  const steps = [
    { label: 'Create your account', done: true, action: () => {} },
    { label: 'Add money', done: portfolio.buyingPower > 0n || activity.some((a) => a.kind === 'deposit'), action: () => open({ type: 'add' }) },
    { label: 'Buy your first stock', done: activity.some((a) => a.kind === 'buy'), action: () => nav('/stocks/TSLA') },
    { label: 'Set up a recurring investment', done: portfolio.plans.length > 0, action: () => open({ type: 'trade', symbol: 'TSLA', side: 'buy', mode: 'recurring' }) },
    { label: 'Place a limit order', done: portfolio.orders.length > 0, action: () => open({ type: 'trade', symbol: 'TSLA', side: 'buy', mode: 'limit' }) },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className={cx('rounded-3xl border border-line p-6', compact ? 'mt-6' : 'mt-6 sm:p-8')} data-testid="get-started">
      <div className="flex items-end justify-between gap-4">
        <div><h2 className="text-[22px] font-semibold tracking-tight">Get started</h2><p className="mt-1 text-[15px] text-muted">{done} of {steps.length} done · a few taps to your first automated investment</p></div>
        <span className="num text-[15px] font-semibold text-up">{Math.round((done / steps.length) * 100)}%</span>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg-2"><div className="h-full rounded-full bg-up transition-all duration-700" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className={cx('mt-5 grid gap-1', !compact && 'sm:grid-cols-1')}>
        {steps.map((s, i) => (
          <li key={s.label}>
            <button disabled={s.done} onClick={s.action} className={cx('flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition', !s.done && 'hover:bg-bg-2', i === next && 'bg-bg-2')}>
              <span className={cx('grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold', s.done ? 'bg-up text-on-up' : i === next ? 'bg-fg text-bg' : 'border border-line-2 text-muted')}>{s.done ? <Check className="size-4" strokeWidth={3} /> : i + 1}</span>
              <span className={cx('flex-1 text-[15px]', s.done ? 'text-muted line-through' : 'font-medium')}>{s.label}</span>
              {!s.done && <ChevronRight className="size-4 text-muted" />}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function TopMovers({ assets }: { assets: Asset[] }) {
  const movers = [...assets].sort((a, b) => Math.abs(b.changePct24h) - Math.abs(a.changePct24h)).slice(0, 3);
  return (
    <section>
      <SectionTitle action={<Link to="/invest" className="text-sm font-semibold text-up">See all</Link>}>Top movers</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {movers.map((a) => {
          const up = a.change24h >= 0;
          const pts = a.history.slice(-80).map((p, i) => ({ t: i, v: p.v }));
          return (
            <Link key={a.symbol} to={`/stocks/${a.symbol}`} className="group rounded-2xl border border-line p-4 transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-18px_rgba(0,0,0,.35)]" data-testid={`mover-${a.symbol}`}>
              <div className="flex items-center gap-3"><StockLogo symbol={a.symbol} color={a.color} size={36} /><div className="min-w-0"><div className="font-semibold leading-tight">{a.symbol}</div><div className="truncate text-[13px] text-muted">{a.name}</div></div></div>
              <div className="mt-4"><Sparkline points={pts} color={up ? 'var(--up)' : 'var(--down)'} width={220} height={44} /></div>
              <div className="mt-2 flex items-baseline justify-between"><span className="num text-[17px] font-semibold">{a.price !== null ? usd(a.price) : '—'}</span>
                <span className={cx('num text-[14px] font-semibold', up ? 'text-up' : 'text-down')}>{up ? '+' : '−'}{Math.abs(a.changePct24h * 100).toFixed(2)}%</span></div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function NewsFeed({ assets }: { assets: Asset[] }) {
  const news = useNews();
  if (news.isError) return null;
  const bySym = Object.fromEntries(assets.map((a) => [a.symbol, a]));
  return (
    <section data-testid="news">
      <SectionTitle>News</SectionTitle>
      {!news.data ? <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div> : news.data.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-muted"><Newspaper className="size-4" /> No headlines right now.</p>
      ) : (
        <ul className="divide-y divide-line">
          {news.data.slice(0, 8).map((n) => (
            <li key={n.id}>
              <a href={n.link} target="_blank" rel="noopener noreferrer" className="group flex gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-muted"><span className="font-semibold text-fg">{n.publisher}</span> · {ago(Math.max(0, Math.floor(Date.now() / 1000) - n.time))}</div>
                  <h3 className="mt-1 text-[16px] font-semibold leading-snug group-hover:underline">{n.title}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {n.tickers.map((t) => { const a = bySym[t]; const up = (a?.change24h ?? 0) >= 0; return (
                      <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-bg-2 px-2 py-0.5 text-[12px] font-semibold">
                        {t}{a && <span className={up ? 'text-up' : 'text-down'}>{up ? '+' : '−'}{Math.abs(a.changePct24h * 100).toFixed(2)}%</span>}
                      </span>); })}
                  </div>
                </div>
                {n.thumb && <img src={n.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-20 shrink-0 rounded-xl object-cover" />}
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-faint">Headlines from third-party publishers via Yahoo Finance. Not investment advice.</p>
    </section>
  );
}
