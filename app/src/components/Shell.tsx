import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Search, Clock, UserRound, CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useApp } from '../state';
import { cx, StockLogo } from './ui';
import { localDemo } from '../lib/config';
import { Mark } from './Brand';
import { useMedia } from '../lib/useMedia';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/invest', label: 'Invest', icon: Search },
  { to: '/activity', label: 'Activity', icon: Clock },
  { to: '/account', label: 'Account', icon: UserRound },
];

export function Logo({ className }: { className?: string }) {
  return <span className={cx('inline-flex items-center gap-2 font-semibold tracking-tight', className)}><Mark className="size-7" />GiFTED!</span>;
}

export function StockSearch() {
  const { market } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const hits = q ? (market?.assets || []).filter((a) => (a.symbol + a.name).toLowerCase().includes(q.toLowerCase())).slice(0, 5) : [];
  return (
    <div className="relative w-full max-w-[380px]">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stocks" aria-label="Search stocks"
        className="h-11 w-full rounded-md border border-line-2 bg-bg pl-9 pr-3 text-[15px] outline-none focus:border-fg" />
      {hits.length > 0 && (
        <div className="absolute left-0 right-0 top-12 z-40 rounded-2xl border border-line bg-card p-1 shadow-xl">
          {hits.map((a) => (
            <button key={a.symbol} onClick={() => { setQ(''); nav(`/stocks/${a.symbol}`); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-bg-2">
              <StockLogo symbol={a.symbol} color={a.color} size={28} /><span className="font-semibold">{a.symbol}</span><span className="text-sm text-muted">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 sm:top-auto sm:bottom-6 sm:right-6 sm:left-auto sm:items-end" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? AlertCircle : Info;
        return (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-xl anim-sheet">
            <Icon className={cx('mt-0.5 size-5 shrink-0', t.tone === 'success' ? 'text-up' : t.tone === 'error' ? 'text-down' : 'text-muted')} />
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold">{t.title}</div>{t.body && <div className="mt-0.5 text-sm text-muted">{t.body}</div>}</div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-fg"><X className="size-4" /></button>
          </div>
        );
      })}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { market, sheet } = useApp();
  const tradingIssue = market && !market.tradingLive;
  const desktop = useMedia('(min-width: 1024px)');
  // On desktop the side panel docks on the left and the page slides over to make room for it.
  const shift = desktop && !!sheet;
  return (
    <div className="min-h-dvh pb-24 transition-[padding] duration-300 ease-out sm:pb-10" style={{ paddingLeft: shift ? 432 : 0 }}>
      {localDemo && <div className="bg-fg py-1.5 text-center text-xs font-semibold text-bg">Demo mode · test money only · nothing here is real</div>}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-4 sm:px-6">
          <NavLink to="/" aria-label="GiFTED! home"><Logo className="text-xl" /></NavLink>
          <div className="hidden flex-1 md:block"><StockSearch /></div>
          <nav className="ml-auto hidden items-center gap-7 sm:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('text-[15px] font-medium transition', isActive ? 'text-up' : 'text-fg hover:text-up')}>{n.label}</NavLink>
            ))}
          </nav>
        </div>
        {tradingIssue && (
          <div className="bg-warn-soft px-4 py-2 text-center text-sm text-warn">Trading is temporarily unavailable. Your money is safe and you can still withdraw or cancel orders.</div>
        )}
      </header>
      <main className="mx-auto max-w-[1280px] px-4 sm:px-6">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 backdrop-blur sm:hidden safe-bottom" aria-label="Main">
        <div className="grid grid-cols-4">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex flex-col items-center gap-1 pt-2.5 text-[11px] font-semibold', isActive ? 'text-fg' : 'text-faint')}>
              <n.icon className="size-6" strokeWidth={2} />{n.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
