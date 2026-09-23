import { useState } from 'react';
import { Pause, Play, Trash2, ExternalLink, Repeat, Timer } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../state';
import { Button, Notice, Row, StockLogo } from '../components/ui';
import { brokerAbi } from '../lib/abi';
import { brokerAddress, explorerUrl } from '../lib/config';
import { execute } from '../lib/tx';
import { humanize } from '../lib/errors';
import { usd, toNum, e18, frequencyLabel, dateLabel, shares as fmtShares } from '../lib/format';
import { describe } from '../screens/Activity';
import { useReady } from '../lib/data';
import { Zap } from 'lucide-react';

const B = brokerAddress!;

function useAction(onDone: () => void) {
  const { session, toast } = useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (key: string, functionName: string, args: unknown[], label: string, success: string) => {
    if (!session) return;
    setBusy(key); setError(null);
    try { await execute(session, [{ address: B, abi: brokerAbi, functionName, args, label }]); await qc.invalidateQueries(); toast({ tone: 'success', title: success }); onDone(); }
    catch (e) { setError(humanize(e)); }
    finally { setBusy(null); }
  };
  return { busy, error, act };
}

export function ManagePlan({ id, onClose }: { id: string; onClose: () => void }) {
  const { market, portfolio } = useApp();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const { busy, error, act } = useAction(onClose);
  const p = portfolio?.plans.find((x) => String(x.id) === id);
  const a = market?.assets.find((x) => x.address.toLowerCase() === p?.asset.toLowerCase());
  const planReady = useReady('plan', p?.id);
  if (!p || !a || !market || !portfolio) return <p className="py-8 text-center text-muted">This recurring investment no longer exists.</p>;
  const now = market.chainTime;
  const low = p.active && portfolio.buyingPower < p.amount;
  const readyNow = planReady.data === true;
  return (
    <div>
      <div className="flex items-center gap-3"><StockLogo symbol={a.symbol} color={a.color} /><div><div className="font-semibold">{a.name}</div><div className="text-sm text-muted">Recurring investment</div></div></div>
      <div className="mt-6">
        <Row label="Amount" value={usd(toNum(p.amount, market.stableDecimals))} />
        <Row label="Frequency" value={frequencyLabel(p.interval)} />
        <Row label="Status" value={p.ended ? 'Ended' : p.active ? 'Active' : 'Paused'} />
        {p.active && <Row label="Next buy" value={dateLabel(Math.max(p.nextAt, now))} />}
        <Row label="Buys so far" value={String(p.runs)} />
        <Row label="Price protection" value={p.maxPriceE18 >= 10n ** 29n ? 'Off' : `Skip above ${usd(e18(p.maxPriceE18))}`} />
      </div>
      {low && <div className="mt-4"><Notice>Your buying power is below {usd(toNum(p.amount, market.stableDecimals))}. The next buy will be skipped unless you add money.</Notice></div>}
      {readyNow && <div className="mt-4 rounded-2xl bg-up-soft p-4 text-sm"><p className="font-semibold text-up">This buy is due now.</p><p className="mt-1 text-muted">It runs automatically within seconds. You can also run it yourself.</p>
        <Button variant="up" block className="mt-3" loading={busy === 'run'} onClick={() => act('run', 'executePlan', [p.id], 'Running recurring buy', `Bought ${a.symbol}`)} data-testid="run-plan"><Zap className="size-4" /> Buy now</Button></div>}
      {error && <div className="mt-4"><Notice tone="down">{error}</Notice></div>}
      {!p.ended && (confirmEnd ? (
        <div className="mt-6 rounded-2xl bg-down-soft p-4">
          <p className="text-sm font-semibold text-down">End this recurring investment? Shares you already own stay in your account.</p>
          <div className="mt-3 grid grid-cols-2 gap-2"><Button variant="secondary" onClick={() => setConfirmEnd(false)}>Keep it</Button><Button variant="danger" loading={busy === 'end'} onClick={() => act('end', 'cancelPlan', [p.id], 'Ending recurring investment', 'Recurring investment ended')}>End</Button></div>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {p.active
            ? <Button variant="secondary" size="lg" loading={busy === 'pause'} onClick={() => act('pause', 'setPlanPaused', [p.id, true], 'Pausing', 'Recurring investment paused')}><Pause className="size-4" /> Pause</Button>
            : <Button variant="secondary" size="lg" loading={busy === 'resume'} onClick={() => act('resume', 'setPlanPaused', [p.id, false], 'Resuming', 'Recurring investment resumed')}><Play className="size-4" /> Resume</Button>}
          <Button variant="danger" size="lg" onClick={() => setConfirmEnd(true)}><Trash2 className="size-4" /> End</Button>
        </div>
      ))}
    </div>
  );
}

export function ManageOrder({ id, onClose }: { id: string; onClose: () => void }) {
  const { market, portfolio } = useApp();
  const { busy, error, act } = useAction(onClose);
  const o = portfolio?.orders.find((x) => String(x.id) === id);
  const a = market?.assets.find((x) => x.address.toLowerCase() === o?.asset.toLowerCase());
  const orderReady = useReady('order', o?.status === 'open' ? o.id : undefined);
  if (!o || !a || !market) return <p className="py-8 text-center text-muted">This order no longer exists.</p>;
  const expired = o.expiry < market.chainTime;
  const status = o.status === 'open' ? (expired ? 'Expired' : 'Waiting for price') : o.status === 'filled' ? 'Filled' : 'Cancelled';
  return (
    <div>
      <div className="flex items-center gap-3"><StockLogo symbol={a.symbol} color={a.color} /><div><div className="font-semibold">Limit buy · {a.symbol}</div><div className="text-sm text-muted">{status}</div></div></div>
      <div className="mt-6">
        <Row label="Amount set aside" value={usd(toNum(o.amount, market.stableDecimals))} />
        <Row label="Limit price" value={usd(e18(o.limitPriceE18))} />
        <Row label="Current price" value={a.price ? usd(a.price) : '—'} />
        <Row label="Placed" value={dateLabel(o.createdAt)} />
        <Row label={expired ? 'Expired' : 'Expires'} value={dateLabel(o.expiry)} />
      </div>
      {error && <div className="mt-4"><Notice tone="down">{error}</Notice></div>}
      {o.status === 'open' && orderReady.data === true && <div className="mt-4 rounded-2xl bg-up-soft p-4 text-sm"><p className="font-semibold text-up">Your price has been reached.</p><p className="mt-1 text-muted">This order fills automatically within seconds, or you can fill it now.</p>
        <Button variant="up" block className="mt-3" loading={busy === 'fill'} onClick={() => act('fill', 'fillOrder', [o.id], 'Filling order', `Limit order filled`)} data-testid="fill-order"><Zap className="size-4" /> Fill now</Button></div>}
      {o.status === 'open' && <Button variant="danger" size="lg" block className="mt-6" loading={!!busy} onClick={() => act('cancel', 'cancelOrder', [o.id], 'Cancelling order', 'Order cancelled, funds returned to buying power')} data-testid="cancel-order">Cancel order</Button>}
    </div>
  );
}

export function ActivityDetail({ itemKey }: { itemKey: string }) {
  const { activity, market } = useApp();
  const item = activity?.find((x) => x.key === itemKey);
  if (!item || !market) return null;
  const a = market.assets.find((x) => x.address.toLowerCase() === item.asset?.toLowerCase());
  const d = describe(item, market);
  const dec = market.stableDecimals;
  return (
    <div>
      <div className="flex items-center gap-3">{a ? <StockLogo symbol={a.symbol} color={a.color} /> : <span className="grid size-10 place-items-center rounded-full bg-bg-2">{item.kind.startsWith('plan') ? <Repeat className="size-5" /> : <Timer className="size-5" />}</span>}
        <div><div className="font-semibold">{d.title}</div><div className="text-sm text-muted">{dateLabel(item.time)}</div></div></div>
      <div className="mt-6">
        {item.amount !== undefined && <Row label={item.kind === 'sell' ? 'Proceeds' : 'Amount'} value={usd(toNum(item.amount, dec))} />}
        {item.shares !== undefined && <Row label="Shares" value={fmtShares(e18(item.shares))} />}
        {item.priceE18 !== undefined && <Row label="Price per share" value={usd(e18(item.priceE18))} />}
        {item.fee !== undefined && item.fee > 0n && <Row label="Fee" value={usd(toNum(item.fee, dec))} />}
        {item.source && <Row label="Order type" value={{ instant: 'Market order', recurring: 'Recurring investment', limit: 'Limit order' }[item.source]} />}
        <Row label="Status" value="Completed" />
      </div>
      {explorerUrl && <a href={`${explorerUrl}/tx/${item.txHash}`} target="_blank" rel="noopener" className="mt-6 flex items-center justify-center gap-1.5 text-sm font-semibold text-up">View receipt on explorer <ExternalLink className="size-4" /></a>}
    </div>
  );
}
