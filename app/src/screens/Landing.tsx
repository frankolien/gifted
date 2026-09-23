import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X, Plus, Minus, ArrowUpRight, Zap, Coins, Lock } from 'lucide-react';
import { Reveal } from '../components/Motion';
import { MarketChart } from '../components/MarketChart';
import { Globe } from '../components/Globe';
import type { Market, Point } from '../lib/data';
import { usd } from '../lib/format';
import { IsoArt, type ArtKind } from '../components/IsoArt';
import { Wordmark, InfoLine } from '../components/Brand';
import { useApp } from '../state';
import { cx } from '../components/ui';

const NAV = [['Invest', '#invest'], ['Autopilot', '#autopilot'], ['Stock Tokens', '#tokens'], ['Pricing', '#pricing'], ['Security', '#security']];

function Pill({ to, children, variant = 'gold', className }: { to: string; children: React.ReactNode; variant?: 'gold' | 'outline' | 'ink' | 'cream'; className?: string }) {
  const v = { gold: 'bg-white text-ink hover:bg-white/90', outline: 'border border-white text-white hover:bg-white/10', ink: 'bg-ink text-white hover:bg-black', cream: 'bg-cream text-ink hover:bg-white' }[variant];
  return <Link to={to} className={cx('inline-flex h-11 items-center justify-center rounded-full px-8 text-[16px] font-medium transition', v, className)}>{children}</Link>;
}

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-[#0a0a0a] text-white">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-10 px-6 lg:px-9">
        <Link to="/" aria-label="GiFTED! home"><Wordmark className="text-[22px]" dark /></Link>
        <nav className="hidden items-center gap-9 text-[16px] text-white/85 lg:flex" aria-label="Main">
          {NAV.map(([l, h]) => <a key={l} href={h} className="hover:text-white/60">{l}</a>)}
        </nav>
        <div className="ml-auto hidden items-center gap-3 sm:flex">
          <Pill to="/login" variant="outline" className="h-10 px-8">Log in</Pill>
          <Pill to="/signup" className="h-10 px-8">Sign up</Pill>
        </div>
        <button className="ml-auto grid size-10 place-items-center sm:ml-0 lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
      </div>
      {open && (
        <div className="border-t border-white/10 px-6 pb-6 lg:hidden anim-fade">
          {NAV.map(([l, h]) => <a key={l} href={h} onClick={() => setOpen(false)} className="block border-b border-white/10 py-4 text-lg">{l}</a>)}
          <div className="mt-6 grid grid-cols-2 gap-3"><Pill to="/login" variant="outline">Log in</Pill><Pill to="/signup">Sign up</Pill></div>
        </div>
      )}
    </header>
  );
}

function Card({ label, title, detail, art }: { label: string; title: string; detail: string; art: ArtKind }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex h-[500px] flex-col overflow-hidden rounded-2xl bg-white p-6 text-ink [--art-bg:#fff]">
      <div className="flex items-start justify-between"><span className="text-[15px]">{label}</span>
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? `Hide details for ${label}` : `Show details for ${label}`} className="grid size-9 place-items-center rounded-full border border-ink transition hover:bg-ink hover:text-white">{open ? <Minus className="size-5" /> : <Plus className="size-5" />}</button></div>
      <h3 className="mt-6 max-w-[16ch] text-[32px] leading-[1.22] tracking-[-0.01em]">{title}</h3>
      <div className={cx('mt-auto flex justify-center transition-all duration-500', open && 'translate-y-8 opacity-0')}><IsoArt kind={art} size={230} /></div>
      <div className={cx('absolute inset-x-0 bottom-0 bg-white p-6 pt-4 text-[16px] leading-relaxed transition-all duration-500', open ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0')}>{detail}</div>
    </div>
  );
}

function Tile({ label, title, body, info, art, tone }: { label: string; title: string; body: string; info: string; art: ArtKind; tone: 'sand' | 'white' | 'ink' | 'cream' }) {
  const t = { sand: 'bg-sand text-ink [--art-bg:var(--sand)]', white: 'bg-white text-ink [--art-bg:#fff]', cream: 'bg-cream text-ink [--art-bg:var(--cream)]', ink: 'bg-ink text-white [--art-bg:var(--ink)]' }[tone];
  return (
    <div className={cx('flex min-h-[640px] flex-col border-line/40 px-6 pb-10 pt-14 sm:px-14 lg:min-h-[900px]', t)}>
      <Reveal>
        <div className="text-[34px] leading-tight opacity-45 sm:text-[40px]">{label}</div>
        <h3 className="mt-1 max-w-[18ch] text-[34px] leading-[1.2] tracking-[-0.02em] sm:text-[40px]">{title}</h3>
        <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed">{body}</p>
        <div className="mt-4"><InfoLine>{info}</InfoLine></div>
      </Reveal>
      <div className="my-auto flex justify-center py-10"><IsoArt kind={art} size={360} className="max-w-full" /></div>
    </div>
  );
}

export function MarketingFooter() {
  const cols: [string, [string, string][]][] = [
    ['Product', [['Invest', '/#invest'], ['Autopilot', '/#autopilot'], ['Stock Tokens', '/#tokens'], ['Pricing', '/#pricing'], ['Sign up', '/signup'], ['Log in', '/login']]],
    ['Stocks', [['Tesla', '/stocks/TSLA'], ['Amazon', '/stocks/AMZN'], ['Palantir', '/stocks/PLTR'], ['Netflix', '/stocks/NFLX'], ['AMD', '/stocks/AMD']]],
    ['Builders', [['Robinhood Chain docs', 'https://docs.robinhood.com/chain/'], ['Stock Token terms', 'https://docs.robinhood.com/chain/stock-tokens/'], ['Arbitrum', 'https://arbitrum.io'], ['Arbitrum Stylus', 'https://docs.arbitrum.io/stylus/gentle-introduction']]],
  ];
  return (
    <footer className="bg-white text-ink">
      <div className="mx-auto max-w-[1440px] px-6 lg:px-9">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/15 py-5 text-[15px]">
          <div className="flex gap-4 underline underline-offset-2"><a href="#disclosures">Disclosures</a><span className="no-underline opacity-40">|</span><Link to="/stocks/TSLA">Live prices</Link></div>
          <Wordmark className="text-lg" />
        </div>
        <div className="grid gap-10 py-10 lg:grid-cols-[1fr_1fr_1fr_2.2fr]">
          {cols.map(([h, links]) => (
            <div key={h}><div className="text-[16px] font-semibold">{h}</div>
              <ul className="mt-6 space-y-3 text-[16px]">{links.map(([l, href]) => <li key={l}>{href.startsWith('http') ? <a href={href} target="_blank" rel="noopener" className="hover:underline">{l}</a> : <Link to={href} className="hover:underline">{l}</Link>}</li>)}</ul></div>
          ))}
          <div id="disclosures" className="space-y-4 text-[15px] leading-relaxed">
            <p className="font-semibold">All investing involves risk.</p>
            <p><b>Stock Tokens</b> are issued by Robinhood Assets (Jersey) Limited. They give economic exposure to US-listed shares, are not shares, carry no voting rights, may not be offered to US persons, and are restricted in some jurisdictions. Eligibility depends on where you live.</p>
            <p><b>GiFTED!</b> is open-source software for Robinhood Chain. It is not a broker-dealer, bank or investment adviser, and it does not give investment advice. Your Stock Tokens are held in your own account. Uninvested dollars are held by the GiFTED! smart contract and can be withdrawn only by you.</p>
            <p><b>This is a testnet prototype</b> built for the Arbitrum Open House buildathon. Prices on testnet are reference prices published by GiFTED!, and no real money is involved.</p>
            <p>Company names and logos are trademarks of their respective owners, shown only to identify the Stock Tokens. GiFTED! is not affiliated with or endorsed by these companies.</p>
            <p className="pt-4 text-[13px]">© {new Date().getFullYear()} GiFTED!</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function ChartSkeleton() { return <div className="h-[470px] animate-pulse rounded-3xl bg-white/[0.04] ring-1 ring-white/10" />; }

export function LiveChart({ market, symbol, tone = 'dark', initial = '3M' as const }: { market?: Market; symbol: string; tone?: 'dark' | 'light'; initial?: '1D' | '1W' | '1M' | '3M' }) {
  const a = market?.assets.find((x) => x.symbol === symbol);
  return a && market ? <MarketChart asset={a} now={market.chainTime} tone={tone} initial={initial} /> : <ChartSkeleton />;
}

/** Real price history with a dot on each weekly buy, and what $25 a week would have become. */
function AutopilotChart({ market }: { market?: Market }) {
  const a = market?.assets.find((x) => x.symbol === 'AMZN') ?? market?.assets[0];
  if (!a || !market) return <ChartSkeleton />;
  const weekly = (pts: Point[]) => { const out: Point[] = []; let next = pts[0]?.t ?? 0; for (const p of pts) if (p.t >= next) { out.push(p); next = p.t + 7 * 86400; } return out; };
  const buys = weekly(a.history.filter((p) => p.t >= market.chainTime - 90 * 86400));
  const shares = buys.reduce((s, p) => s + 25 / p.v, 0);
  const invested = buys.length * 25, value = shares * (a.price ?? 0), gain = value - invested;
  return (
    <MarketChart asset={a} now={market.chainTime} initial="3M" ranges={['1M', '3M']} markers={weekly}
      footer={<div className="mt-5 grid grid-cols-3 gap-4 border-t border-white/10 pt-5 text-[15px]">
        <div><div className="text-white/55">Weekly buys</div><div className="num mt-1 text-[22px] font-medium">{buys.length} × $25</div></div>
        <div><div className="text-white/55">Invested</div><div className="num mt-1 text-[22px] font-medium">{usd(invested)}</div></div>
        <div><div className="text-white/55">Worth today</div><div className="num mt-1 text-[22px] font-medium">{usd(value)} <span className={gain >= 0 ? 'text-[#2fd46a]' : 'text-[#ff6b4a]'} style={{ fontSize: 14 }}>{gain >= 0 ? '+' : '−'}{usd(Math.abs(gain))}</span></div></div>
      </div>} />
  );
}

export function Landing() {
  const { market } = useApp();
  const fee = market ? market.feeBps / 100 : 0.25;
  const feeLabel = fee === 0 ? '0%' : `${fee.toFixed(2).replace(/0$/, '')}%`;
  return (
    <div className="bg-[#0a0a0a] text-white">
      <MarketingNav />

      {/* Hero */}
      <section id="invest" className="relative overflow-hidden bg-[#0a0a0a]">
        <div className="relative z-10 mx-auto max-w-[1100px] px-6 pb-16 pt-24 text-center sm:pt-28">
          <Reveal as="h1" className="serif text-[54px] leading-[1.02] tracking-[-0.02em] text-white sm:text-[90px] sm:leading-[1.06]">Invest on your time,<br className="hidden sm:block" /> in your dollars.</Reveal>
          <Reveal delay={1}><p className="mx-auto mt-8 max-w-[640px] text-[17px] leading-relaxed text-white/85">Buy slices of the world’s top companies from $1, around the clock. Put it on autopilot, and keep every share in an account only you control.</p></Reveal>
          <Reveal delay={2}><div className="mt-5"><InfoLine>Testnet prototype · Limitations and risks apply</InfoLine></div></Reveal>
          <Reveal delay={3}><div className="mt-8"><Pill to="/signup">Get started</Pill></div></Reveal>
        </div>
        <Globe market={market} />
      </section>

      {/* Stock Tokens */}
      <section id="tokens" className="bg-[#0a0a0a]">
        <div className="mx-auto grid max-w-[1440px] items-center gap-12 px-6 py-24 lg:grid-cols-[1fr_1.25fr] lg:px-14">
          <Reveal>
            <div className="text-[36px] leading-tight text-white/45 sm:text-[40px]">Stock Tokens</div>
            <h2 className="max-w-[15ch] text-[36px] leading-[1.2] tracking-[-0.02em] sm:text-[40px]">Catch market moves, day or night</h2>
            <p className="mt-6 max-w-[430px] text-[17px] leading-relaxed text-white/85">Place orders 24/7 on Robinhood Chain. Prices follow the US market 24 hours a day, 5 days a week, and your order fills the moment they’re live.</p>
            <div className="mt-5"><InfoLine>Limitations and risks apply</InfoLine></div>
            <div className="mt-8"><Link to="/stocks/TSLA" className="inline-flex items-center gap-1 text-[16px] font-medium text-white hover:text-white/70">See all live prices <ArrowUpRight className="size-4" /></Link></div>
          </Reveal>
          <Reveal delay={1}><LiveChart market={market} symbol="TSLA" /></Reveal>
        </div>
      </section>

      {/* Autopilot */}
      <section id="autopilot" className="overflow-hidden" style={{ background: 'linear-gradient(180deg, #9aa3b5 0%, #4b5368 55%, #0a0a0a 100%)' }}>
        <div className="mx-auto grid max-w-[1440px] items-center gap-12 px-6 py-24 lg:grid-cols-2 lg:px-14">
          <div className="order-2 lg:order-1"><AutopilotChart market={market} /></div>
          <Reveal className="order-1 lg:order-2">
            <div className="flex items-center gap-2 text-[26px]"><Wordmark dark /><span className="font-light text-white/90">Autopilot</span></div>
            <h2 className="mt-8 max-w-[17ch] text-[36px] leading-[1.2] tracking-[-0.02em] sm:text-[40px]">Put your investing on repeat</h2>
            <p className="mt-8 max-w-[480px] text-[17px] leading-relaxed text-white/90">Pick a stock, an amount and how often. We’ll buy it every day, week or month, even while you sleep. Pause or stop any time, with no penalty.</p>
            <p className="mt-6 max-w-[480px] text-[17px] text-white/90">Optional price protection skips a buy if the price spikes.</p>
            <div className="mt-8"><Pill to="/signup">Get started</Pill></div>
            <p className="mt-10 max-w-[480px] text-[13px] text-white/70">Chart uses real past prices to show how a weekly buy works. Past performance doesn’t predict future results.</p>
          </Reveal>
        </div>
      </section>

      {/* Split tiles */}
      <section className="grid lg:grid-cols-2">
        <Tile tone="sand" label="Fractional shares" title="Start with as little as $1" body="Big share prices shouldn’t decide what you can own. Buy any dollar amount and get the exact slice it pays for." info="Fractional investing disclosures" art="fraction" />
        <Tile tone="white" label="Limit orders" title="Name your price, we’ll watch the market" body="Set the price you want to pay. We set the money aside and buy the moment the price gets there, or give it back if you cancel." info="Order execution disclosures" art="slabs" />
        <Tile tone="cream" label="Self-custody" title="Your stocks live in your account, not ours" body="Every share lands in an account secured by your own passkey. GiFTED! can’t move it, freeze it or lend it out." info="Custody disclosures" art="shield" />
        <Tile tone="ink" label="Digital dollars" title="Skip the currency markup" body="Fund with USDG, a regulated digital dollar. No conversion spread hidden in your deposit, and withdrawals whenever you want." info="Stablecoin risk disclosures" art="coins" />
      </section>

      {/* How it works */}
      <section className="bg-mist py-24 text-ink">
        <Reveal as="h2" className="mx-auto max-w-[16ch] px-6 text-center text-[40px] leading-[1.18] tracking-[-0.02em] sm:text-[52px]">How GiFTED! makes investing simpler</Reveal>
        <div className="mx-auto mt-16 grid max-w-[924px] gap-3 px-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card label="Passkey sign-in" title="No passwords. No seed phrases." art="rings" detail="Create your account with Face ID, Touch ID or your fingerprint. Your passkey syncs across your devices, and your account key never leaves them." />
          <Card label="Recurring investment" title="Invest on autopilot" art="bowl" detail="Choose an amount and a schedule. Buys run on time, every time, and you can pause, resume or end them with one tap." />
          <Card label="Fractional shares" title="Start from $1" art="fraction" detail="Enter a dollar amount and get the exact fraction of a share it buys. No lot sizes, no minimums." />
          <Card label="Open 24/7" title="Place orders any time" art="capsules" detail="Orders can be placed day or night. They fill against a live reference price, within 1%, or not at all." />
          <Card label="Limit orders" title="Buy at the price you choose" art="slabs" detail="Pick your price and how long to wait. Cancel any time and the money goes straight back to your buying power." />
          <Card label="Gas included" title="Network fees are on us" art="cluster" detail="You never need to buy crypto to pay for transactions. GiFTED! covers network fees for you." />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-[#0a0a0a]">
        <div className="mx-auto max-w-[1440px] px-6 py-24 lg:px-[72px]">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <Reveal>
              <h2 className="text-[40px] leading-[1.18] tracking-[-0.02em] text-[#e7dfcd] sm:text-[52px]">Clear pricing,<br /><span className="text-white">built into the code</span></h2>
              <p className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-white/85">One small fee per trade, shown before you confirm. It’s capped at 1% by the smart contract itself, so it can never quietly go up.</p>
              <div className="mt-4"><InfoLine>Pricing disclosures</InfoLine></div>
              <div className="mt-7"><Pill to="/signup" variant="cream">Start investing</Pill></div>
            </Reveal>
            <Reveal delay={1} className="flex justify-center lg:justify-end">
              <div className="serif text-[140px] leading-none sm:text-[190px]" style={{ background: 'linear-gradient(180deg,#ffffff,#8f8f8a)', WebkitBackgroundClip: 'text', color: 'transparent' }}>{feeLabel}<span className="ml-2 align-top text-[40px] sm:text-[52px]">per trade</span></div>
            </Reveal>
          </div>
          <div className="mt-20 grid gap-14 text-[#e7dfcd] md:grid-cols-3">
            {[
              [Coins, 'No currency markup', 'You invest in dollars, so there’s no hidden spread on the way in or out.'],
              [Zap, 'No account fees', 'No monthly fee, no inactivity fee, no fee to add money or withdraw.'],
              [Lock, 'Capped on-chain', 'The contract rejects any fee above 1%. Anyone can check it.'],
            ].map(([I, t, d]: any, i) => (
              <Reveal key={t} delay={i as 0 | 1 | 2}>
                <span className="grid size-14 place-items-center rounded-full border border-white/70 text-white"><I className="size-6" /></span>
                <h3 className="mt-6 text-[32px] leading-[1.2] tracking-[-0.01em]">{t}</h3>
                <p className="mt-4 max-w-[320px] text-[16px] leading-relaxed text-white/80">{d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="bg-[#0a0a0a] py-24 [--art-bg:#0a0a0a]">
        <Reveal as="h2" className="mx-auto max-w-[14ch] px-6 text-center text-[40px] leading-[1.18] tracking-[-0.02em] sm:text-[52px]">Built to protect what’s yours</Reveal>
        <div className="mx-auto mt-16 grid max-w-[720px] gap-x-10 gap-y-20 px-6 sm:grid-cols-2">
          {([['cluster', 'Your account key is created from your passkey and never leaves your device.'], ['rings', 'Every trade is checked against a live price. If it moves more than 1%, nothing happens.'], ['shield', 'Only you can withdraw your money. Not us, not anyone else.'], ['capsules', 'Our smart contracts are open source and tested against thousands of random scenarios.']] as [ArtKind, string][]).map(([k, t]) => (
            <div key={t} className="text-center"><div className="flex justify-center"><IsoArt kind={k} size={170} stroke="#e7dfcd" /></div><p className="mx-auto mt-6 max-w-[300px] text-[19px] leading-snug">{t}</p></div>
          ))}
        </div>
      </section>

      {/* Closing */}
      <section className="border-t border-white/10 bg-[#0a0a0a] px-6 py-28 text-center">
        <Reveal as="h2" className="serif mx-auto max-w-[14ch] text-[52px] leading-[1.05] tracking-[-0.02em] sm:text-[72px]">Join a new generation of investors</Reveal>
        <Reveal delay={1}><div className="mt-10 flex flex-wrap justify-center gap-3"><Pill to="/signup">Get started</Pill><Link to="/stocks/TSLA" className="inline-flex h-11 items-center gap-1 rounded-full px-6 text-[16px] text-white/85 hover:text-white">See live prices <ArrowUpRight className="size-4" /></Link></div></Reveal>
      </section>

      <MarketingFooter />
    </div>
  );
}
