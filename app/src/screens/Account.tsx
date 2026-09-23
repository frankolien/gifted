import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, Fingerprint, Wallet, LogOut, Lock, ChevronRight, ExternalLink, FlaskConical, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../state';
import { Button, Row, SectionTitle, Segmented, cx } from '../components/ui';
import { lock, signOut, renameProfile } from '../account/session';
import { publicClient, relayerHealth } from '../lib/chain';
import { feedAbi } from '../lib/abi';
import { chain, explorerUrl, localDemo, ngnPerUsd, relayerUrl } from '../lib/config';
import { execute } from '../lib/tx';
import { humanize } from '../lib/errors';
import { usd, toNum, ago, short, frequencyLabel, dateLabel } from '../lib/format';
import { portfolioTotals } from '../lib/data';

function Status({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 border-b border-line py-3 last:border-0">
      <span className={cx('mt-1.5 size-2.5 shrink-0 rounded-full', ok === null ? 'bg-faint' : ok ? 'bg-up' : 'bg-warn')} />
      <div><div className="font-medium">{label}</div><div className="text-sm text-muted">{detail}</div></div>
    </div>
  );
}

function DemoTools() {
  const { session, market, toast } = useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [sym, setSym] = useState('TSLA');
  if (!localDemo || !session || !market) return null;
  const run = async (key: string, fn: () => Promise<unknown>, msg: string) => {
    setBusy(key);
    try { await fn(); await qc.invalidateQueries(); toast({ tone: 'success', title: msg }); } catch (e) { toast({ tone: 'error', title: 'Demo action failed', body: humanize(e) }); } finally { setBusy(null); }
  };
  const restamp = async () => {
    for (const a of market.assets) {
      const [, answer] = (await publicClient.readContract({ address: a.feed, abi: feedAbi, functionName: 'latestRoundData' })) as any;
      await execute(session, [{ address: a.feed, abi: feedAbi, functionName: 'set', args: [answer], label: 'Refreshing price' }]);
    }
  };
  const move = (pctMove: number) => run(`move${pctMove}`, async () => {
    const a = market.assets.find((x) => x.symbol === sym)!;
    const [, answer] = (await publicClient.readContract({ address: a.feed, abi: feedAbi, functionName: 'latestRoundData' })) as any;
    await execute(session, [{ address: a.feed, abi: feedAbi, functionName: 'set', args: [(answer * BigInt(Math.round((1 + pctMove) * 1000))) / 1000n], label: 'Moving price' }]);
  }, `${sym} ${pctMove > 0 ? 'up' : 'down'} ${Math.abs(pctMove * 100)}%`);
  const skip = (seconds: number, label: string) => run(`ff${seconds}`, async () => {
    await publicClient.request({ method: 'evm_increaseTime' as any, params: [seconds] as any });
    await publicClient.request({ method: 'evm_mine' as any, params: [] as any });
    await restamp();
  }, `Skipped ahead ${label}`);
  return (
    <>
      <SectionTitle><span className="inline-flex items-center gap-2"><FlaskConical className="size-5" /> Demo tools</span></SectionTitle>
      <div className="rounded-3xl border border-dashed border-line-2 p-5" data-testid="demo-tools">
        <p className="text-sm text-muted">Only on the local demo chain. Use these to show recurring buys and limit orders executing without waiting.</p>
        <div className="mt-4 text-sm font-semibold">Skip ahead in time</div>
        <div className="mt-2 flex flex-wrap gap-2">{([[3600, '1 hour'], [86400, '1 day'], [604800, '1 week']] as const).map(([s, l]) => <Button key={s} size="sm" variant="secondary" loading={busy === `ff${s}`} onClick={() => skip(s, l)}>+{l}</Button>)}</div>
        <div className="mt-5 text-sm font-semibold">Move a stock price</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={sym} onChange={(e) => setSym(e.target.value)} aria-label="Stock" className="h-9 rounded-full border border-line-2 bg-card px-3 text-sm">{market.assets.map((a) => <option key={a.symbol}>{a.symbol}</option>)}</select>
          {[-0.1, -0.05, 0.05].map((m) => <Button key={m} size="sm" variant="secondary" loading={busy === `move${m}`} onClick={() => move(m)} data-testid={`move${m}`}>{m > 0 ? '+' : '−'}{Math.abs(m * 100)}%</Button>)}
        </div>
      </div>
    </>
  );
}

export function Account() {
  const { session, setSession, market, portfolio, open, theme, setTheme, showNgn, setShowNgn } = useApp();
  const [copied, setCopied] = useState(false);
  const [health, setHealth] = useState<any>(undefined);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session?.profile.name ?? '');
  useEffect(() => { relayerHealth().then(setHealth); const t = setInterval(() => relayerHealth().then(setHealth), 10000); return () => clearInterval(t); }, []);
  if (!session) return null;
  const p = session.profile;
  const dec = market?.stableDecimals ?? 6;
  const totals = market && portfolio ? portfolioTotals(market, portfolio) : null;
  const freshest = market ? Math.max(...market.assets.map((a) => a.updatedAt)) : 0;
  const allOk = market?.assets.every((a) => a.priceOk);
  const plans = portfolio?.plans.filter((x) => !x.ended) ?? [];
  const security = { passkey: 'Protected by a passkey that syncs across your devices', device: 'Protected by a passkey. This account is stored on this device only', wallet: 'Connected browser wallet', demo: 'Demo account for the local chain' }[p.kind];

  return (
    <div className="mx-auto max-w-2xl pt-6">
      <div className="flex items-center gap-4">
        <div className="grid size-16 place-items-center rounded-full bg-fg text-2xl font-bold text-bg">{(p.name || 'G')[0].toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); renameProfile(name.trim()); setSession({ ...session, profile: { ...p, name: name.trim() } }); setEditing(false); }} className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className="h-10 flex-1 rounded-xl border border-line-2 bg-card px-3" autoFocus /><Button size="sm" type="submit">Save</Button>
            </form>
          ) : <button onClick={() => setEditing(true)} className="text-2xl font-bold tracking-tight hover:underline">{p.name || 'Add your name'}</button>}
          <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">{p.kind === 'wallet' ? <Wallet className="size-4" /> : <Fingerprint className="size-4 text-up" />}{security}</div>
        </div>
      </div>

      <SectionTitle>Money</SectionTitle>
      <Row label="Total value" value={totals ? usd(totals.total) : '—'} />
      <Row label="Buying power" value={portfolio ? usd(toNum(portfolio.buyingPower, dec)) : '—'} onClick={() => open({ type: 'buying-power' })} />
      <Row label="USDG in your wallet" value={portfolio ? usd(toNum(portfolio.walletStable, dec)) : '—'} />
      <Row label="Account address" hint="Send USDG on Robinhood Chain here to add money" value={
        <button onClick={() => { navigator.clipboard?.writeText(session.address); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="inline-flex items-center gap-1.5 font-mono text-sm">{short(session.address)}{copied ? <Check className="size-4 text-up" /> : <Copy className="size-4 text-muted" />}</button>} />
      <div className="mt-4 grid grid-cols-2 gap-3"><Button onClick={() => open({ type: 'add' })}>Add money</Button><Button variant="secondary" onClick={() => open({ type: 'withdraw' })}>Withdraw</Button></div>

      <SectionTitle>Recurring investments</SectionTitle>
      {plans.length === 0 ? <p className="text-sm text-muted">None yet. Open any stock and choose <b>Recurring</b> to invest automatically. <Link to="/invest" className="font-semibold text-up">Browse stocks</Link></p> :
        plans.map((x) => { const a = market?.assets.find((m) => m.address.toLowerCase() === x.asset.toLowerCase()); return (
          <Row key={String(x.id)} onClick={() => open({ type: 'plan', id: String(x.id) })} label={`${a?.symbol} · ${usd(toNum(x.amount, dec))} ${frequencyLabel(x.interval).toLowerCase()}`} hint={x.active ? `Next: ${dateLabel(Math.max(x.nextAt, market!.chainTime))}` : 'Paused'} value={<ChevronRight className="size-4 text-muted" />} />); })}

      <SectionTitle>System status</SectionTitle>
      <div className="rounded-3xl border border-line px-5">
        <Status ok={market ? market.tradingLive : null} label={market?.tradingLive ? 'Trading is available' : 'Trading is paused'} detail={market?.tradingLive ? 'Buy, sell and automated orders are running normally.' : 'Deposits, withdrawals and cancellations still work.'} />
        <Status ok={market ? !!allOk : null} label={allOk ? 'Live prices' : 'Some prices are delayed'} detail={market ? `Last update ${ago(market.chainTime - freshest)}. Prices update 24/5 in US market sessions.` : 'Checking…'} />
        <Status ok={relayerUrl ? (health === undefined ? null : !!health && Date.now() - health.keeper.lastTick < 30 * 60_000) : null} label="Automatic orders" detail={!relayerUrl ? 'Automation service not configured for this app.' : health === undefined ? 'Checking…' : health ? `Recurring buys and limit orders are checked automatically and run as soon as they're due.${health.keeper.executed !== undefined ? ` ${health.keeper.executed} executed since last restart.` : ''}` : 'Automation service is unreachable. Scheduled orders will run when it’s back.'} />
        <Status ok={relayerUrl ? !!health?.drip?.enabled : null} label="Network fees covered" detail={health?.drip?.enabled ? 'GiFTED! pays the network fee for your transactions.' : localDemo ? 'Covered automatically on the local demo.' : 'Gas sponsorship not configured.'} />
        <Status ok label={chain.name} detail={`Chain ${chain.id}${explorerUrl ? '' : ' · local'}`} />
      </div>

      <SectionTitle>Settings</SectionTitle>
      <div className="flex items-center justify-between border-b border-line py-3"><span>Appearance</span>
        <Segmented label="Appearance" value={theme} onChange={setTheme} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>
      {ngnPerUsd && <label className="flex items-center justify-between border-b border-line py-3"><span>Show naira estimates<span className="block text-sm text-muted">At an indicative ₦{ngnPerUsd.toLocaleString()} per $1</span></span>
        <input type="checkbox" checked={showNgn} onChange={(e) => setShowNgn(e.target.checked)} className="size-5 accent-[var(--up)]" /></label>}

      <SectionTitle>Security</SectionTitle>
      <div className="flex gap-3 rounded-2xl bg-bg-2 p-4 text-sm"><ShieldCheck className="size-5 shrink-0 text-up" />
        <p>{p.kind === 'wallet' ? 'Your wallet signs every transaction.' : 'Your account key is created from your passkey and never leaves your device.'} Your stocks are held in your own account. GiFTED! can’t move them. Your cash balance sits in the GiFTED! smart contract and only you can withdraw it.</p></div>
      {explorerUrl && <a href={`${explorerUrl}/address/${session.address}`} target="_blank" rel="noopener" className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-up">View your account on the explorer <ExternalLink className="size-4" /></a>}
      <div className="mt-4 grid grid-cols-2 gap-3">
        {p.kind !== 'wallet' && <Button variant="secondary" onClick={() => { lock(); setSession(null); }}><Lock className="size-4" /> Lock</Button>}
        <Button variant="secondary" onClick={() => { signOut(); setSession(null); }} data-testid="sign-out"><LogOut className="size-4" /> Sign out</Button>
      </div>

      <DemoTools />

      <SectionTitle>Disclosures</SectionTitle>
      <div className="space-y-2 pb-10 text-xs leading-relaxed text-faint">
        <p>Stock Tokens are issued by Robinhood Assets (Jersey) Limited and provide economic exposure to US shares. They are not shares, carry no voting rights, may not be offered to US persons, and are restricted in some jurisdictions. Availability depends on where you live.</p>
        <p>GiFTED! is software, not a broker-dealer or bank. This is a testnet prototype built for the Arbitrum Open House buildathon. Testnet prices are reference prices published by GiFTED!, and no real money is involved.</p>
        <p>Investing involves risk, including loss of principal. Past performance does not guarantee future results.</p>
      </div>
    </div>
  );
}
