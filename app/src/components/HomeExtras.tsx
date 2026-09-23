import { Link } from 'react-router-dom';
import { Newspaper } from 'lucide-react';
import { useNews, type Asset } from '../lib/data';
import { Sparkline } from './Chart';
import { StockLogo, SectionTitle, Skeleton, cx } from './ui';
import { usd, ago } from '../lib/format';

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
