import { useState } from 'react';
import { isAddress, type Address } from 'viem';
import { Check, Copy, Landmark, Wallet, ArrowDownToLine, ArrowUpFromLine, Info } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { publicClient } from '../lib/chain';
import { dateLabel } from '../lib/format';
import { useApp } from '../state';
import { AmountPad } from '../components/AmountPad';
import { Button, Notice, Row, cx } from '../components/ui';
import { brokerAbi, erc20Abi } from '../lib/abi';
import { brokerAddress, localDemo, stableFaucetUrl } from '../lib/config';
import { execute, type Call } from '../lib/tx';
import { humanize } from '../lib/errors';
import { usd, ngn, toNum, parseMoney, short } from '../lib/format';
import { MAX } from '../lib/data';

const B = brokerAddress!;

function Done({ title, body, onClose }: { title: string; body: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center py-6 text-center" data-testid="money-done">
      <div className="grid size-20 place-items-center rounded-full bg-up text-on-up anim-pop"><Check className="size-10" strokeWidth={3} /></div>
      <h3 className="mt-6 text-2xl font-bold tracking-tight">{title}</h3><p className="mt-2 text-muted">{body}</p>
      <Button size="lg" block className="mt-8" onClick={onClose}>Done</Button>
    </div>
  );
}

function useRunner() {
  const { session, toast } = useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (calls: Call[]) => {
    if (!session) return false;
    setError(null);
    try { await execute(session, calls, (s) => setBusy(s.label)); qc.invalidateQueries(); return true; }
    catch (e) { setError(humanize(e)); toast({ tone: 'error', title: 'That didn’t go through', body: humanize(e) }); return false; }
    finally { setBusy(null); }
  };
  return { busy, error, run };
}

export function AddMoney({ onClose }: { onClose: () => void }) {
  const { market, portfolio, session, showNgn } = useApp();
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<'demo' | 'wallet' | 'faucet'>(localDemo ? 'demo' : market?.stableFaucet ? 'faucet' : 'wallet');
  const claim = useQuery({ queryKey: ['claim', session?.address], enabled: !!market?.stableFaucet && !!session,
    queryFn: () => publicClient.readContract({ address: market!.stable, abi: erc20Abi, functionName: 'nextClaimAt', args: [session!.address] }) as Promise<bigint> });
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useRunner();
  if (!market || !portfolio || !session) return null;
  const dec = market.stableDecimals;
  const raw = parseMoney(amount, dec);
  const wallet = portfolio.walletStable;
  const err = raw && source === 'wallet' && raw > wallet ? `You have ${usd(toNum(wallet, dec))} USDG in your wallet` : raw && toNum(raw, dec) > 100_000 ? 'Maximum is $100,000 per transfer' : null;

  if (done) return <Done title={`${done} added`} body="It’s in your buying power and ready to invest." onClose={onClose} />;

  const faucetAmt = market.stableFaucet ?? 0n;
  const claimAt = Number(claim.data ?? 0n);
  const canClaim = claimAt === 0 || claimAt <= market.chainTime;
  const claimFaucet = async () => {
    const calls: Call[] = [{ address: market.stable, abi: erc20Abi, functionName: 'faucet', args: [], label: 'Getting test dollars' }];
    if (portfolio.stableAllowance < faucetAmt) calls.push({ address: market.stable, abi: erc20Abi, functionName: 'approve', args: [B, MAX], label: 'Authorizing your test dollars' });
    calls.push({ address: B, abi: brokerAbi, functionName: 'deposit', args: [faucetAmt], label: 'Adding to buying power' });
    if (await run(calls)) { setDone(usd(toNum(faucetAmt, dec))); claim.refetch(); }
  };

  const submit = async () => {
    if (!raw) return;
    const calls: Call[] = [];
    if (source === 'demo') calls.push({ address: market.stable, abi: erc20Abi, functionName: 'mint', args: [session.address, raw], label: 'Getting test dollars' });
    if (portfolio.stableAllowance < raw) calls.push({ address: market.stable, abi: erc20Abi, functionName: 'approve', args: [B, MAX], label: 'Authorizing your USDG' });
    calls.push({ address: B, abi: brokerAbi, functionName: 'deposit', args: [raw], label: 'Adding to buying power' });
    if (await run(calls)) setDone(usd(toNum(raw, dec)));
  };

  return (
    <div>
      <div className="grid gap-2">
        {localDemo && (
          <button onClick={() => setSource('demo')} aria-pressed={source === 'demo'} className={cx('flex items-center gap-3 rounded-2xl border p-3 text-left', source === 'demo' ? 'border-fg' : 'border-line')}>
            <span className="grid size-10 place-items-center rounded-full bg-bg-2"><Landmark className="size-5" /></span>
            <span className="flex-1"><span className="block font-semibold">Test bank</span><span className="text-sm text-muted">Free demo dollars, arrives instantly</span></span>
          </button>
        )}
        {market.stableFaucet && (
          <button onClick={() => setSource('faucet')} aria-pressed={source === 'faucet'} className={cx('flex items-center gap-3 rounded-2xl border p-3 text-left', source === 'faucet' ? 'border-fg' : 'border-line')} data-testid="source-faucet">
            <span className="grid size-10 place-items-center rounded-full bg-bg-2"><Landmark className="size-5" /></span>
            <span className="flex-1"><span className="block font-semibold">Free test dollars</span><span className="text-sm text-muted">{usd(toNum(faucetAmt, dec))} once a day · testnet only</span></span>
          </button>
        )}
        <button onClick={() => setSource('wallet')} aria-pressed={source === 'wallet'} className={cx('flex items-center gap-3 rounded-2xl border p-3 text-left', source === 'wallet' ? 'border-fg' : 'border-line')}>
          <span className="grid size-10 place-items-center rounded-full bg-bg-2"><Wallet className="size-5" /></span>
          <span className="flex-1"><span className="block font-semibold">{market.stableSymbol} in your wallet</span><span className="num text-sm text-muted">{usd(toNum(wallet, dec))} available</span></span>
        </button>
      </div>
      {source === 'faucet' ? (
        <div className="mt-6 text-center">
          <div className="num text-5xl font-bold tracking-tight">{usd(toNum(faucetAmt, dec))}</div>
          <p className="mt-2 text-sm text-muted">{canClaim ? 'Free test dollars for trying GiFTED! on testnet. They have no value.' : `You’ve claimed today. Next claim ${dateLabel(claimAt)}.`}</p>
          {error && <div className="mt-4"><Notice tone="down">{error}</Notice></div>}
          <Button size="lg" block className="mt-6" disabled={!canClaim} loading={!!busy} onClick={claimFaucet} data-testid="faucet-confirm">{busy ?? `Get ${usd(toNum(faucetAmt, dec))} test dollars`}</Button>
        </div>
      ) : source === 'wallet' && wallet === 0n ? (
        <div className="mt-5 space-y-4">
          <Notice tone="info" icon={<Info className="size-4 shrink-0" />}>Send USDG (Global Dollar) on Robinhood Chain to your account address below, from an exchange or another wallet. It shows up here in seconds.</Notice>
          <div className="rounded-2xl bg-bg-2 p-4"><div className="text-xs text-muted">Your account address</div>
            <div className="mt-1 flex items-center gap-2"><code className="flex-1 break-all text-sm">{session.address}</code>
              <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(session.address); setCopied(true); }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? 'Copied' : 'Copy'}</Button></div></div>
          {stableFaucetUrl && <a href={stableFaucetUrl} target="_blank" rel="noopener" className="block text-center text-sm font-semibold text-up">Get free test USDG from the Paxos faucet</a>}
        </div>
      ) : (
        <>
          <AmountPad value={amount} onChange={setAmount} error={err} caption={showNgn && raw ? ngn(toNum(raw, dec)) : 'Goes to your buying power'}
            presets={[{ label: '$50', value: '50' }, { label: '$100', value: '100' }, { label: '$500', value: '500' }]} />
          {error && <div className="mb-3"><Notice tone="down">{error}</Notice></div>}
          <Button size="lg" block disabled={!raw || !!err} loading={!!busy} onClick={submit} data-testid="add-confirm">{busy ?? (raw ? `Add ${usd(toNum(raw, dec))}` : 'Add money')}</Button>
          <p className="mt-3 text-center text-xs text-faint">{localDemo && source === 'demo' ? 'Demo money has no value.' : 'No fees to add money. Withdraw anytime.'}</p>
        </>
      )}
    </div>
  );
}

export function Withdraw({ onClose }: { onClose: () => void }) {
  const { market, portfolio, session } = useApp();
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState<'wallet' | 'external'>('wallet');
  const [to, setTo] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useRunner();
  if (!market || !portfolio || !session) return null;
  const dec = market.stableDecimals;
  const raw = parseMoney(amount, dec);
  const bp = portfolio.buyingPower;
  const err = raw && raw > bp ? `You can withdraw up to ${usd(toNum(bp, dec))}` : null;
  const badAddr = dest === 'external' && to && !isAddress(to);
  if (done) return <Done title={`${done} withdrawn`} body={dest === 'wallet' ? 'It’s in your USDG wallet. You can send it anywhere.' : `Sent to ${short(to)}.`} onClose={onClose} />;
  const submit = async () => {
    if (!raw) return;
    const calls: Call[] = [{ address: B, abi: brokerAbi, functionName: 'withdraw', args: [raw], label: 'Withdrawing from buying power' }];
    if (dest === 'external') calls.push({ address: market.stable, abi: erc20Abi, functionName: 'transfer', args: [to as Address, raw], label: `Sending to ${short(to)}` });
    if (await run(calls)) setDone(usd(toNum(raw, dec)));
  };
  return (
    <div>
      <AmountPad value={amount} onChange={setAmount} error={err} caption={`${usd(toNum(bp, dec))} available to withdraw`}
        presets={bp > 0n ? [{ label: 'Max', value: toNum(bp, dec).toFixed(2) === toNum(bp, dec).toString() ? toNum(bp, dec).toString() : (Math.floor(toNum(bp, dec) * 100) / 100).toFixed(2) }] : []} />
      <div className="mb-4 grid grid-cols-2 gap-2">
        {([['wallet', 'My USDG wallet'], ['external', 'Another address']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setDest(v)} aria-pressed={dest === v} className={cx('h-11 rounded-2xl border text-sm font-semibold', dest === v ? 'border-fg bg-fg text-bg' : 'border-line-2')}>{l}</button>))}
      </div>
      {dest === 'external' && <input value={to} onChange={(e) => setTo(e.target.value.trim())} placeholder="0x… address on Robinhood Chain" aria-label="Destination address" className={cx('mb-4 h-12 w-full rounded-2xl border bg-card px-4 font-mono text-sm outline-none', badAddr ? 'border-down' : 'border-line-2 focus:border-fg')} />}
      {portfolio.reserved > 0n && <p className="mb-3 text-xs text-muted">{usd(toNum(portfolio.reserved, dec))} is set aside for limit orders. Cancel an order to withdraw it.</p>}
      {error && <div className="mb-3"><Notice tone="down">{error}</Notice></div>}
      <Button size="lg" block disabled={!raw || !!err || (dest === 'external' && (!to || !!badAddr))} loading={!!busy} onClick={submit} data-testid="withdraw-confirm">{busy ?? (raw ? `Withdraw ${usd(toNum(raw, dec))}` : 'Withdraw')}</Button>
    </div>
  );
}

export function BuyingPower({ onAdd, onWithdraw }: { onAdd: () => void; onWithdraw: () => void }) {
  const { market, portfolio } = useApp();
  if (!market || !portfolio) return null;
  const dec = market.stableDecimals;
  return (
    <div>
      <div className="text-center"><div className="text-sm text-muted">Buying power</div><div className="num text-4xl font-bold tracking-tight">{usd(toNum(portfolio.buyingPower, dec))}</div></div>
      <div className="mt-6">
        <Row label="Available to invest" value={usd(toNum(portfolio.buyingPower, dec))} />
        <Row label="Set aside for limit orders" value={usd(toNum(portfolio.reserved, dec))} />
        <Row label="USDG in your wallet" value={usd(toNum(portfolio.walletStable, dec))} hint="Used automatically when you buy" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button size="lg" onClick={onAdd}><ArrowDownToLine className="size-4" /> Add money</Button>
        <Button size="lg" variant="secondary" onClick={onWithdraw}><ArrowUpFromLine className="size-4" /> Withdraw</Button>
      </div>
    </div>
  );
}

