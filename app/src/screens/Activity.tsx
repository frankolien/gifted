import { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Repeat, Timer, XCircle, Pause, Play } from 'lucide-react';
import { useApp } from '../state';
import type { ActivityItem, Market } from '../lib/data';
import { Segmented, Skeleton, StockLogo } from '../components/ui';
import { usd, toNum, e18, shares as fmtShares, frequencyLabel, dayHeading } from '../lib/format';

export function describe(i: ActivityItem, market: Market) {
  const a = market.assets.find((x) => x.address.toLowerCase() === i.asset?.toLowerCase());
  const sym = a?.symbol ?? '';
  const amt = i.amount !== undefined ? usd(toNum(i.amount, market.stableDecimals)) : '';
  switch (i.kind) {
    case 'deposit': return { title: 'Added money', sub: 'To buying power', value: `+${amt}`, positive: true };
    case 'withdraw': return { title: 'Withdrew money', sub: 'To your USDG wallet', value: `−${amt}` };
    case 'buy': return { title: `Bought ${sym}`, sub: `${i.source === 'recurring' ? 'Recurring investment' : i.source === 'limit' ? 'Limit order filled' : 'Market order'} · ${fmtShares(e18(i.shares!))} shares`, value: `−${amt}` };
    case 'sell': return { title: `Sold ${sym}`, sub: `${fmtShares(e18(i.shares!))} shares`, value: `+${amt}`, positive: true };
    case 'plan-created': return { title: `Started recurring ${sym}`, sub: `${amt} ${frequencyLabel(i.interval!).toLowerCase()}`, value: '' };
    case 'plan-ended': return { title: 'Ended a recurring investment', sub: '', value: '' };
    case 'plan-paused': return { title: 'Paused a recurring investment', sub: '', value: '' };
    case 'plan-resumed': return { title: 'Resumed a recurring investment', sub: '', value: '' };
    case 'order-placed': return { title: `Limit buy ${sym}`, sub: `${amt} at ${usd(e18(i.limitPriceE18!))} or lower`, value: '' };
    case 'order-cancelled': return { title: 'Cancelled a limit order', sub: 'Funds returned to buying power', value: '' };
  }
}

const icon = (i: ActivityItem) => ({ deposit: ArrowDownToLine, withdraw: ArrowUpFromLine, 'plan-created': Repeat, 'plan-ended': XCircle, 'plan-paused': Pause, 'plan-resumed': Play, 'order-placed': Timer, 'order-cancelled': XCircle } as Record<string, any>)[i.kind];

type Filter = 'all' | 'trades' | 'money' | 'auto';
export function Activity() {
  const { activity, market, open } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const items = (activity ?? []).filter((i) => filter === 'all' || (filter === 'trades' ? i.kind === 'buy' || i.kind === 'sell' : filter === 'money' ? i.kind === 'deposit' || i.kind === 'withdraw' : i.kind.startsWith('plan') || i.kind.startsWith('order') || i.source === 'recurring' || i.source === 'limit'));
  const groups: [string, ActivityItem[]][] = [];
  for (const i of items) { const h = dayHeading(i.time); const g = groups.at(-1); if (g && g[0] === h) g[1].push(i); else groups.push([h, [i]]); }
  return (
    <div className="mx-auto max-w-2xl pt-6">
      <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
      <div className="mt-4"><Segmented label="Filter activity" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'trades', label: 'Buys & sells' }, { value: 'money', label: 'Money' }, { value: 'auto', label: 'Automations' }]} /></div>
      {!activity || !market ? <Skeleton className="mt-6 h-64 w-full" /> : items.length === 0 ? (
        <div className="py-16 text-center"><p className="font-semibold">Nothing here yet</p><p className="mt-1 text-sm text-muted">Your buys, sells and transfers will show up here.</p></div>
      ) : groups.map(([h, list]) => (
        <section key={h} className="mt-6" data-testid="activity-group">
          <h2 className="text-sm font-semibold text-muted">{h}</h2>
          <div className="mt-1">
            {list.map((i) => { const d = describe(i, market)!; const a = market.assets.find((x) => x.address.toLowerCase() === i.asset?.toLowerCase()); const I = icon(i); return (
              <button key={i.key} onClick={() => open({ type: 'activity', key: i.key })} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 -mx-2 text-left hover:bg-bg-2">
                {(i.kind === 'buy' || i.kind === 'sell') && a ? <StockLogo symbol={a.symbol} color={a.color} /> : <span className="grid size-10 place-items-center rounded-full bg-bg-2">{I && <I className="size-5" />}</span>}
                <div className="min-w-0 flex-1"><div className="font-semibold">{d.title}</div>{d.sub && <div className="truncate text-sm text-muted">{d.sub}</div>}</div>
                {d.value && <div className={`num font-semibold ${d.positive ? 'text-up' : ''}`}>{d.value}</div>}
              </button>); })}
          </div>
        </section>
      ))}
    </div>
  );
}
