import { useMemo, useState } from 'react';
import { parseEventLogs, parseUnits, type Hex } from 'viem';
import { Check, ChevronLeft, Repeat, Timer, Zap, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../state';
import { AmountPad } from '../components/AmountPad';
import { Button, Notice, Row, cx, StockLogo } from '../components/ui';
import { brokerAbi, erc20Abi } from '../lib/abi';
import { brokerAddress, SLIPPAGE_BPS } from '../lib/config';
import { publicClient } from '../lib/chain';
import { execute, type Call } from '../lib/tx';
import { humanize } from '../lib/errors';
import { usd, ngn, toNum, e18, parseMoney, shares as fmtShares, frequencyLabel, dateLabel } from '../lib/format';
import { MAX } from '../lib/data';

type Side = 'buy' | 'sell';
type Mode = 'now' | 'recurring' | 'limit';
type Step = 'amount' | 'options' | 'review' | 'working' | 'done';

const FREQS = [86400, 604800, 1209600, 2592000];

function RowL({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-2.5"><span className="text-[15px] text-muted">{label}</span>{children}</div>;
}
const B = brokerAddress!;
const NO_CAP = 10n ** 30n;

export function TradeFlow({ symbol, initialSide = 'buy', initialMode = 'now', onClose, inline }: { symbol: string; initialSide?: Side; initialMode?: Mode; onClose: () => void; inline?: boolean }) {
  const { market, portfolio, session, open, toast, showNgn } = useApp();
  const qc = useQueryClient();
  const asset = market?.assets.find((a) => a.symbol === symbol);
  const [side, setSide] = useState<Side>(initialSide);
  const [mode, setMode] = useState<Mode>(initialSide === 'sell' ? 'now' : initialMode);
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [sellAll, setSellAll] = useState(false);
  const [freq, setFreq] = useState(604800);
  const [start, setStart] = useState<'today' | 'tomorrow' | 'week'>('today');
  const [capOn, setCapOn] = useState(false);
  const [cap, setCap] = useState('');
  const [limit, setLimit] = useState('');
  const [tif, setTif] = useState<'day' | 'gtc'>('gtc');
  const [progress, setProgress] = useState<{ labels: string[]; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; body: string } | null>(null);

  const now = market?.chainTime ?? Math.floor(Date.now() / 1000);
  const dec = market?.stableDecimals ?? 6;
  const price = asset?.price ?? 0;
  const held = asset && portfolio ? portfolio.holdings[asset.address]?.balance ?? 0n : 0n;
  const heldValue = e18(held) * price;
  const bp = portfolio?.buyingPower ?? 0n;
  const wallet = portfolio?.walletStable ?? 0n;
  const raw = parseMoney(amount, dec);
  const usdAmount = raw ? toNum(raw, dec) : 0;
  const feePct = (market?.feeBps ?? 0) / 10_000;
  const instantBlocked = !market?.tradingLive ? 'Trading is temporarily unavailable. Try again shortly.' : asset && !asset.priceOk ? 'Live prices are paused right now (market closed or data delayed). Place a limit order instead: it fills when prices resume.' : null;

  // Funding: use buying power first, then top up from the USDG wallet automatically.
  const needsNow = side === 'buy' && (mode !== 'recurring' || start === 'today');
  const shortfall = needsNow && raw ? (raw > bp ? raw - bp : 0n) : 0n;
  const fromWallet = shortfall > 0n && wallet >= shortfall ? shortfall : 0n;
  const unfunded = shortfall > 0n && wallet < shortfall;

  const sellShares = useMemo(() => {
    if (side !== 'sell' || !raw || !price) return 0n;
    if (sellAll) return held;
    const s = parseUnits((usdAmount / price).toFixed(18), 18);
    return s > held ? held : s;
  }, [side, raw, price, sellAll, held, usdAmount]);

  const amountError = (() => {
    if (!amount) return null;
    if (!raw) return 'Enter a valid amount';
    if (usdAmount < 1) return 'Minimum is $1.00';
    if (side === 'sell' && !sellAll && usdAmount > heldValue + 0.005) return `You have ${usd(heldValue)} of ${symbol}`;
    if (side === 'buy' && mode !== 'recurring' && unfunded) return `Not enough money. You have ${usd(toNum(bp + wallet, dec))} available`;
    return null;
  })();

  const capE18 = capOn ? parseMoney(cap, 18) : NO_CAP;
  const limitE18 = parseMoney(limit, 18);

  if (!asset || !market || !session) return <div className="py-16 text-center text-muted">Loading…</div>;

  const caption = side === 'sell'
    ? `You own ${fmtShares(e18(held))} shares (${usd(heldValue)})`
    : `${usd(toNum(bp, dec))} buying power${wallet > 0n ? ` · ${usd(toNum(wallet, dec))} in wallet` : ''}`;

  const est = price && usdAmount ? (usdAmount * (1 - feePct)) / price : 0;

  const startAt = start === 'today' ? 0 : start === 'tomorrow' ? now + 86400 : now + 7 * 86400;

  async function submit() {
    if (!raw || !asset || !market || !session || !portfolio) return;
    const calls: Call[] = [];
    if (fromWallet > 0n) {
      if (portfolio.stableAllowance < fromWallet) calls.push({ address: market.stable, abi: erc20Abi, functionName: 'approve', args: [B, MAX], label: 'Authorizing your USDG' });
      calls.push({ address: B, abi: brokerAbi, functionName: 'deposit', args: [fromWallet], label: `Adding ${usd(toNum(fromWallet, dec))} to buying power` });
    }
    let doneTitle = '', doneBody = '';
    if (side === 'sell') {
      if ((portfolio.holdings[asset.address]?.allowance ?? 0n) < sellShares) calls.push({ address: asset.address, abi: erc20Abi, functionName: 'approve', args: [B, MAX], label: `Authorizing ${symbol} sales` });
      calls.push({ address: B, abi: brokerAbi, functionName: 'sellNow', args: [asset.address, sellShares, SLIPPAGE_BPS], label: `Selling ${symbol}` });
    } else if (mode === 'now') {
      calls.push({ address: B, abi: brokerAbi, functionName: 'buyNow', args: [asset.address, raw, SLIPPAGE_BPS], label: `Buying ${symbol}` });
    } else if (mode === 'recurring') {
      calls.push({ address: B, abi: brokerAbi, functionName: 'createPlan', args: [asset.address, raw, BigInt(freq), BigInt(startAt), capE18 ?? NO_CAP, SLIPPAGE_BPS], label: 'Setting up your recurring investment' });
      doneTitle = `${usd(usdAmount)} of ${symbol} ${frequencyLabel(freq).toLowerCase()}`;
      doneBody = start === 'today' ? 'Your first buy goes through in the next minute. After that it runs automatically.' : `Your first buy is on ${dateLabel(startAt)}. Keep enough buying power so buys aren’t skipped.`;
    } else {
      const expiry = BigInt(now + (tif === 'day' ? 86400 : 90 * 86400));
      calls.push({ address: B, abi: brokerAbi, functionName: 'createOrder', args: [asset.address, raw, limitE18!, expiry, SLIPPAGE_BPS], label: 'Placing your limit order' });
      doneTitle = 'Limit order placed';
      doneBody = `We’ll buy ${usd(usdAmount)} of ${symbol} if the price drops to ${usd(toNum(limitE18!, 18))} or lower. The money is set aside until then, and you can cancel anytime.`;
    }
    setStep('working'); setError(null); setProgress({ labels: calls.map((c) => c.label), index: 0 });
    try {
      const hashes = await execute(session, calls, (s) => setProgress({ labels: calls.map((c) => c.label), index: s.state === 'done' ? s.index + 1 : s.index }));
      if (side === 'sell' || mode === 'now') {
        const receipt = await publicClient.getTransactionReceipt({ hash: hashes.at(-1) as Hex });
        const logs = parseEventLogs({ abi: brokerAbi, logs: receipt.logs });
        const b = logs.find((l) => l.eventName === 'Bought') as any; const s = logs.find((l) => l.eventName === 'Sold') as any;
        if (b) { doneTitle = `You bought ${fmtShares(e18(b.args.received))} shares of ${symbol}`; doneBody = `${usd(toNum(b.args.spent, dec))} at ${usd(e18(b.args.priceE18))} per share. Your shares are in your account now.`; }
        if (s) { doneTitle = `You sold ${fmtShares(e18(s.args.assetIn))} shares of ${symbol}`; doneBody = `${usd(toNum(s.args.proceeds, dec))} was added to your buying power.`; }
      }
      setResult({ title: doneTitle, body: doneBody }); setStep('done');
      qc.invalidateQueries();
    } catch (e) {
      setError(humanize(e)); setStep('review');
      toast({ tone: 'error', title: 'Order not completed', body: humanize(e) });
    }
  }

  // ---------------------------------------------------------------- views
  const header = (
    <div className="flex items-center gap-3">
      {(step === 'options' || step === 'review') && (
        <button onClick={() => setStep(step === 'review' && mode !== 'now' && side === 'buy' && !inline ? 'options' : 'amount')} aria-label="Back" className="-ml-2 grid size-9 place-items-center rounded-full hover:bg-bg-2"><ChevronLeft className="size-5" /></button>
      )}
      <StockLogo symbol={asset.symbol} color={asset.color} size={32} />
      <div className="min-w-0"><div className="font-semibold leading-tight">{side === 'sell' ? 'Sell' : mode === 'recurring' ? 'Recurring investment' : mode === 'limit' ? 'Limit buy' : 'Buy'} {symbol}</div>
        <div className="num text-xs text-muted">{usd(price)} per share</div></div>
    </div>
  );

  if (step === 'done' && result) {
    return (
      <div className="flex flex-col items-center py-6 text-center" data-testid="trade-done">
        <div className="grid size-20 place-items-center rounded-full bg-up text-on-up anim-pop"><Check className="size-10" strokeWidth={3} /></div>
        <h3 className="mt-6 text-2xl font-bold tracking-tight">{result.title}</h3>
        <p className="mt-2 max-w-sm text-muted">{result.body}</p>
        <Button size="lg" block className="mt-8" onClick={onClose}>Done</Button>
      </div>
    );
  }

  if (step === 'working' && progress) {
    return (
      <div className="py-6">
        {header}
        <div className="mt-8 space-y-4" aria-live="polite">
          {progress.labels.map((l, i) => (
            <div key={l} className="flex items-center gap-3">
              <span className={cx('grid size-7 place-items-center rounded-full', i < progress.index ? 'bg-up text-on-up' : 'bg-bg-2')}>
                {i < progress.index ? <Check className="size-4" strokeWidth={3} /> : i === progress.index ? <Loader2 className="size-4 animate-spin" /> : null}
              </span>
              <span className={cx(i > progress.index && 'text-muted')}>{l}</span>
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">{session.profile.kind === 'wallet' ? 'Confirm each step in your wallet.' : 'This usually takes a few seconds.'}</p>
      </div>
    );
  }

  if (step === 'options') {
    return (
      <div>
        {header}
        {mode === 'recurring' ? (
          <div className="mt-6 space-y-6">
            <fieldset><legend className="mb-2 text-sm font-semibold">How often</legend>
              <div className="grid grid-cols-2 gap-2">{FREQS.map((f) => (
                <button key={f} onClick={() => setFreq(f)} aria-pressed={freq === f} className={cx('h-12 rounded-2xl border text-sm font-semibold', freq === f ? 'border-fg bg-fg text-bg' : 'border-line-2')}>{frequencyLabel(f)}</button>
              ))}</div></fieldset>
            <fieldset><legend className="mb-2 text-sm font-semibold">First buy</legend>
              <div className="grid grid-cols-3 gap-2">{([['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'In a week']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setStart(v)} aria-pressed={start === v} className={cx('h-12 rounded-2xl border text-sm font-semibold', start === v ? 'border-fg bg-fg text-bg' : 'border-line-2')}>{l}</button>
              ))}</div></fieldset>
            <div className="rounded-2xl border border-line p-4">
              <label className="flex items-center justify-between gap-3"><span><span className="font-semibold">Price protection</span><span className="block text-sm text-muted">Skip a buy if the price spikes above a level you choose</span></span>
                <input type="checkbox" checked={capOn} onChange={(e) => { setCapOn(e.target.checked); if (!cap) setCap((price * 1.15).toFixed(2)); }} className="size-5 accent-[var(--up)]" /></label>
              {capOn && <div className="mt-3 flex items-center gap-2 rounded-xl bg-bg-2 px-3"><span className="text-muted">$</span><input aria-label="Skip above price" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} className="h-11 flex-1 bg-transparent outline-none num" /></div>}
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div>
              <label htmlFor="limit" className="text-sm font-semibold">Buy when the price is at or below</label>
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-line-2 px-4 focus-within:border-fg"><span className="text-muted text-xl">$</span>
                <input id="limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} className="num h-14 flex-1 bg-transparent text-2xl font-semibold outline-none" /></div>
              <div className="mt-2 flex gap-2">{[0.99, 0.95, 0.9].map((m) => (
                <button key={m} onClick={() => setLimit((price * m).toFixed(2))} className="h-8 rounded-full bg-bg-2 px-3 text-[13px] font-semibold">−{Math.round((1 - m) * 100)}%</button>))}
                <span className="ml-auto self-center text-sm text-muted num">Now {usd(price)}</span></div>
              {limitE18 && e18(limitE18) >= price && <p className="mt-2 text-sm text-up">At or above today’s price, so this should fill almost immediately.</p>}
            </div>
            <fieldset><legend className="mb-2 text-sm font-semibold">Keep the order open</legend>
              <div className="grid grid-cols-2 gap-2">{([['day', 'Good for 24 hours'], ['gtc', 'Good till canceled']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setTif(v)} aria-pressed={tif === v} className={cx('h-12 rounded-2xl border text-sm font-semibold', tif === v ? 'border-fg bg-fg text-bg' : 'border-line-2')}>{l}</button>))}</div>
              {tif === 'gtc' && <p className="mt-2 text-xs text-muted">Good-till-canceled orders expire after 90 days.</p>}
            </fieldset>
          </div>
        )}
        <Button size="lg" block className="mt-8" disabled={mode === 'limit' ? !limitE18 : capOn && !capE18} onClick={() => setStep('review')}>Review</Button>
      </div>
    );
  }

  if (step === 'review') {
    const lines: [string, string, string?][] = [];
    if (side === 'sell') {
      lines.push(['Shares to sell', fmtShares(e18(sellShares))], ['Market price', usd(price)], ['Estimated proceeds', usd(e18(sellShares) * price * (1 - feePct))]);
      if (feePct) lines.push(['Fee', usd(e18(sellShares) * price * feePct), `${(feePct * 100).toFixed(2)}%`]);
      lines.push(['Paid into', 'Buying power']);
    } else {
      lines.push(['Amount', usd(usdAmount)]);
      if (mode === 'now') lines.push(['Market price', usd(price)], ['Estimated shares', fmtShares(est)]);
      if (mode === 'recurring') lines.push(['Frequency', frequencyLabel(freq)], ['First buy', start === 'today' ? 'Today' : dateLabel(startAt)], ['Price protection', capOn && capE18 ? `Skip above ${usd(toNum(capE18, 18))}` : 'Off']);
      if (mode === 'limit') lines.push(['Limit price', usd(toNum(limitE18!, 18))], ['Estimated shares', `${fmtShares((usdAmount * (1 - feePct)) / toNum(limitE18!, 18))} or more`], ['Expires', tif === 'day' ? 'In 24 hours' : 'In 90 days']);
      if (feePct) lines.push(['Fee', usd(usdAmount * feePct), `${(feePct * 100).toFixed(2)}%${mode === 'recurring' ? ' per buy' : ''}`]);
      lines.push(['Paid from', fromWallet > 0n ? `Buying power + ${usd(toNum(fromWallet, dec))} from wallet` : 'Buying power']);
    }
    const cta = side === 'sell' ? `Sell ${usd(usdAmount)} of ${symbol}` : mode === 'now' ? `Buy ${usd(usdAmount)} of ${symbol}` : mode === 'recurring' ? 'Start recurring investment' : 'Place limit order';
    return (
      <div>
        {header}
        <div className="mt-6 text-center"><div className="text-sm text-muted">{side === 'sell' ? 'You’re selling' : mode === 'recurring' ? `You’re investing ${frequencyLabel(freq).toLowerCase()}` : 'You’re buying'}</div>
          <div className="num text-4xl font-bold tracking-tight">{usd(usdAmount)}</div>{showNgn && ngn(usdAmount) && <div className="text-sm text-muted">{ngn(usdAmount)}</div>}</div>
        <div className="mt-6">{lines.map(([l, v, h]) => <Row key={l} label={l} value={v} hint={h} />)}</div>
        {mode === 'recurring' && side === 'buy' && start === 'today' && unfunded && <div className="mt-4"><Notice icon={<AlertTriangle className="size-4 shrink-0" />}>You don’t have enough for today’s buy yet. It will run as soon as you add money.</Notice></div>}
        {(side === 'sell' || mode === 'now') && <p className="mt-4 flex gap-2 text-xs text-muted"><ShieldCheck className="size-4 shrink-0 text-up" />Filled at the live market price, within 1%. If the price moves more than that, the order is cancelled and nothing is charged.</p>}
        {error && <div className="mt-4"><Notice tone="down">{error}</Notice></div>}
        <Button size="lg" variant="up" block className="mt-6" onClick={submit} data-testid="confirm">{cta}</Button>
      </div>
    );
  }

  // ---------------------------------------------------------------- desktop order card (form rows)
  if (inline && step === 'amount') {
    const field = 'h-10 w-[150px] rounded-md border border-line-2 bg-bg px-3 text-right text-[15px] outline-none num focus:border-fg';
    const cardBlocked = (side === 'sell' || mode === 'now') && instantBlocked;
    const needsLimit = mode === 'limit' && side === 'buy';
    const valid = !!raw && !amountError && !cardBlocked && (!needsLimit || !!limitE18) && (!(mode === 'recurring' && cap) || !!parseMoney(cap, 18));
    const go = () => { if (mode === 'recurring') setCapOn(!!cap); setStep('review'); };
    const total = side === 'sell' ? e18(sellShares) * price * (1 - feePct) : usdAmount;
    return (
      <div data-testid="order-card">
        <div className="-mx-5 -mt-5 flex items-center justify-between border-b border-line px-5 py-4">
          <label className="flex items-center gap-1 text-[17px] font-semibold">
            <select aria-label="Buy or sell" value={side} onChange={(e) => { const v = e.target.value as Side; setSide(v); setMode('now'); setAmount(''); setSellAll(false); }}
              className="cursor-pointer appearance-none bg-transparent pr-5 outline-none" style={{ backgroundImage: 'none' }}>
              <option value="buy">Buy {symbol}</option>{held > 0n && <option value="sell">Sell {symbol}</option>}
            </select><span aria-hidden className="-ml-5 pointer-events-none text-muted">▾</span>
          </label>
        </div>
        <div className="mt-3">
          <RowL label="Order type">
            <select aria-label="Order type" value={side === 'sell' ? 'now' : mode} disabled={side === 'sell'} onChange={(e) => { const m = e.target.value as Mode; setMode(m); if (m === 'limit' && !limit) setLimit((price * 0.95).toFixed(2)); }} className={cx(field, 'w-[190px] text-left')}>
              <option value="now">Market order</option>{side === 'buy' && <><option value="recurring">Recurring investment</option><option value="limit">Limit order</option></>}
            </select>
          </RowL>
          <RowL label={side === 'sell' ? 'Amount to sell' : 'Amount'}>
            <div className="flex items-center gap-2">
              {side === 'sell' && heldValue > 0 && <button className="text-[13px] font-semibold text-up" onClick={() => { setAmount(heldValue.toFixed(2)); setSellAll(true); }}>Sell all</button>}
              <input aria-label="Amount in dollars" data-testid="card-amount" inputMode="decimal" placeholder="$0.00" value={amount ? `$${amount}` : ''}
                onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (/^\d*\.?\d{0,2}$/.test(v)) { setAmount(v); setSellAll(side === 'sell' && held > 0n && v === heldValue.toFixed(2)); } }} className={field} />
            </div>
          </RowL>
          {mode === 'recurring' && side === 'buy' && <>
            <RowL label="Frequency"><select aria-label="Frequency" value={freq} onChange={(e) => setFreq(Number(e.target.value))} className={cx(field, 'text-left')}>{FREQS.map((f) => <option key={f} value={f}>{frequencyLabel(f)}</option>)}</select></RowL>
            <RowL label="First buy"><select aria-label="First buy" value={start} onChange={(e) => setStart(e.target.value as typeof start)} className={cx(field, 'text-left')}><option value="today">Today</option><option value="tomorrow">Tomorrow</option><option value="week">In a week</option></select></RowL>
            <RowL label="Skip if price above"><input aria-label="Skip if price above" inputMode="decimal" placeholder="No limit" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^0-9.]/g, ''))} className={field} /></RowL>
          </>}
          {needsLimit && <>
            <RowL label="Limit price"><input aria-label="Limit price" data-testid="card-limit" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ''))} className={field} /></RowL>
            <RowL label="Expires"><select aria-label="Expires" value={tif} onChange={(e) => setTif(e.target.value as typeof tif)} className={cx(field, 'text-left')}><option value="day">Good for 24 hours</option><option value="gtc">Good till canceled</option></select></RowL>
          </>}
          <RowL label="Market price"><span className="num text-[15px] font-medium">{usd(price)}</span></RowL>
          <RowL label={side === 'sell' ? 'Shares to sell' : needsLimit ? 'Est. shares at limit' : 'Est. shares'}><span className="num text-[15px] font-medium">{side === 'sell' ? fmtShares(e18(sellShares)) : raw ? fmtShares(needsLimit && limitE18 ? (usdAmount * (1 - feePct)) / toNum(limitE18, 18) : est) : '0'}</span></RowL>
          {feePct > 0 && <RowL label="Fee"><span className="num text-[15px]">{usd((side === 'sell' ? e18(sellShares) * price : usdAmount) * feePct)}</span></RowL>}
          <div className="mt-2 flex items-center justify-between border-t border-line pt-4"><span className="text-[15px] font-semibold">{side === 'sell' ? 'Estimated credit' : mode === 'recurring' ? `Each ${frequencyLabel(freq).replace('Every ', '').toLowerCase()}` : 'Estimated cost'}</span><span className="num text-[15px] font-semibold">{usd(total)}</span></div>
        </div>
        {amountError && <p className="mt-3 text-[13px] text-down">{amountError}</p>}
        {cardBlocked && <div className="mt-3"><Notice icon={<AlertTriangle className="size-4 shrink-0" />}>{cardBlocked}</Notice></div>}
        {side === 'buy' && fromWallet > 0n && <p className="mt-3 text-[13px] text-muted">{usd(toNum(fromWallet, dec))} will move from your USDG wallet to buying power.</p>}
        <Button size="lg" variant="up" block className="mt-5" disabled={!valid} onClick={go} data-testid="review">Review order</Button>
        {side === 'buy' && unfunded && mode !== 'recurring' && raw && <Button variant="secondary" block className="mt-2" onClick={() => open({ type: 'add' })}>Add money</Button>}
        <p className="mt-4 border-t border-line pt-4 text-center text-[13px] text-muted num">{side === 'sell' ? `${fmtShares(e18(held))} shares available · ${usd(heldValue)}` : `${usd(toNum(bp, dec))} buying power available`}</p>
      </div>
    );
  }

  // amount step
  const modes: { v: Mode; label: string; icon: any }[] = [{ v: 'now', label: 'Buy now', icon: Zap }, { v: 'recurring', label: 'Recurring', icon: Repeat }, { v: 'limit', label: 'Limit', icon: Timer }];
  const blocked = (side === 'sell' || mode === 'now') && instantBlocked;
  const continueLabel = side === 'buy' && mode !== 'now' ? 'Continue' : 'Review';
  const next = () => { setStep(side === 'buy' && mode !== 'now' ? 'options' : 'review'); if (mode === 'limit' && !limit) setLimit((price * 0.95).toFixed(2)); };
  return (
    <div>
      <div className="flex items-center justify-between">
        {header}
        {held > 0n && (
          <div className="flex rounded-full bg-bg-2 p-1 text-sm font-semibold">
            {(['buy', 'sell'] as const).map((s) => <button key={s} onClick={() => { setSide(s); setMode('now'); setAmount(''); setSellAll(false); }} aria-pressed={side === s} className={cx('rounded-full px-3 py-1 capitalize', side === s && 'bg-card shadow')}>{s}</button>)}
          </div>
        )}
      </div>
      {side === 'buy' && (
        <div className="mt-5 grid grid-cols-3 gap-2" role="tablist" aria-label="Order type">
          {modes.map(({ v, label, icon: I }) => (
            <button key={v} role="tab" aria-selected={mode === v} onClick={() => setMode(v)} className={cx('flex h-11 items-center justify-center gap-1.5 rounded-2xl border text-sm font-semibold', mode === v ? 'border-fg bg-fg text-bg' : 'border-line-2 text-muted')}><I className="size-4" />{label}</button>
          ))}
        </div>
      )}
      <AmountPad value={amount} onChange={(v) => { setAmount(v); setSellAll(side === 'sell' && held > 0n && v === heldValue.toFixed(2)); }} error={amountError}
        caption={blocked ? undefined : amount && side === 'buy' && mode === 'now' && est ? `≈ ${fmtShares(est)} shares` : caption}
        presets={side === 'sell' ? [{ label: '25%', value: (heldValue * 0.25).toFixed(2) }, { label: '50%', value: (heldValue * 0.5).toFixed(2) }, { label: 'Sell all', value: heldValue.toFixed(2) }] : [{ label: '$10', value: '10' }, { label: '$25', value: '25' }, { label: '$50', value: '50' }, { label: '$100', value: '100' }]} />
      {blocked && <div className="mt-3"><Notice icon={<AlertTriangle className="size-4 shrink-0" />}>{blocked}</Notice></div>}
      {side === 'buy' && unfunded && mode !== 'recurring' && raw && (
        <Button variant="secondary" block className="mt-3" onClick={() => { onClose(); open({ type: 'add' }); }}>Add money</Button>
      )}
      <Button size="lg" block className="mt-4" disabled={!raw || !!amountError || !!blocked} onClick={next} data-testid="review">{continueLabel}</Button>
      {!inline && <p className="mt-3 text-center text-xs text-faint">Orders can be placed 24/7. Prices update 24/5.</p>}
    </div>
  );
}
