import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Fingerprint, Wallet, ShieldCheck, Sparkles, KeyRound, ArrowLeft } from 'lucide-react';
import { useApp } from '../state';
import { Button, Notice } from '../components/ui';
import { Wordmark } from '../components/Brand';
import { IsoArt } from '../components/IsoArt';
import { Reveal } from '../components/Motion';
import { LiveChart } from './Landing';
import { signUpWithPasskey, signInWithPasskey, signInWithWallet, signInDemo, loadProfile, signOut } from '../account/session';
import { passkeysSupported } from '../account/passkey';
import { ensureGas } from '../lib/chain';
import { humanize } from '../lib/errors';
import { localDemo } from '../lib/config';

function useSignIn() {
  const { setSession, toast } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<any> | any, welcome?: string) => {
    setBusy(key); setError(null);
    try {
      const s = await fn();
      await ensureGas(s.address).catch(() => {});
      setSession(s); nav('/', { replace: true });
      if (welcome) toast({ tone: 'success', title: welcome });
    } catch (e: any) {
      const raw = `${e?.name ?? ''} ${e?.message ?? ''}`;
      if (/NotAllowed|cancel|abort/i.test(raw)) return;
      setError(e?.message && e.message.length < 220 && !/reverted|Request|HTTP/i.test(e.message) ? e.message : humanize(e));
    } finally { setBusy(null); }
  };
  return { busy, error, run };
}

function AuthFrame({ side, children }: { side: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-white text-ink lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-[#0a0a0a] text-white lg:block">{side}</aside>
      <main className="flex flex-col px-6 py-8 sm:px-16">
        <div className="flex items-center justify-between"><Link to="/" aria-label="GiFTED! home"><Wordmark className="text-[22px]" /></Link>
          <Link to="/" className="text-[15px] text-ink/60 hover:text-ink lg:hidden"><ArrowLeft className="inline size-4" /> Home</Link></div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}

export function Signup() {
  const { market } = useApp();
  const [name, setName] = useState('');
  const { busy, error, run } = useSignIn();
  const supported = passkeysSupported();
  return (
    <AuthFrame side={
      <div className="flex h-full flex-col px-16 pt-20">
        <Reveal as="h1" className="serif max-w-[12ch] text-[64px] leading-[1.02] tracking-[-0.02em] text-white">Your first share is a few taps away</Reveal>
        <Reveal delay={1}><p className="mt-6 max-w-[420px] text-[17px] text-white/80">Create your account in under a minute. No password to remember, no recovery phrase to write down.</p></Reveal>
        <div className="mt-auto pb-16"><LiveChart market={market} symbol="PLTR" initial="1M" /></div>
      </div>
    }>
      <div className="mb-8 h-1 w-full rounded-full bg-ink/10"><div className="h-1 w-1/2 rounded-full bg-ink" /></div>
      <h1 className="text-[32px] font-medium leading-tight tracking-[-0.01em]">Create your account</h1>
      <p className="mt-2 text-[15px] text-ink/60">Step 1 of 2 · Tell us what to call you</p>
      <label htmlFor="name" className="mt-8 block text-[13px] font-semibold uppercase tracking-wider text-ink/60">First name</label>
      <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} autoFocus
        className="mt-2 h-14 w-full rounded-lg border border-ink/20 px-4 text-[17px] outline-none focus:border-ink" />
      <ul className="mt-8 space-y-4 text-[15px]">
        <li className="flex gap-3"><Fingerprint className="mt-0.5 size-5 shrink-0" /><span><b>Secured by a passkey</b>: Face ID, Touch ID, fingerprint or device PIN.</span></li>
        <li className="flex gap-3"><KeyRound className="mt-0.5 size-5 shrink-0" /><span><b>Syncs across devices</b> with iCloud Keychain or Google Password Manager.</span></li>
        <li className="flex gap-3"><Sparkles className="mt-0.5 size-5 shrink-0" /><span><b>Network fees covered.</b> You never need to buy crypto for gas.</span></li>
      </ul>
      {error && <div className="mt-6"><Notice tone="down">{error}</Notice></div>}
      <Button size="lg" block className="mt-8 !bg-ink !text-white" disabled={!name.trim() || !supported} loading={busy === 'create'} onClick={() => run('create', () => signUpWithPasskey(name.trim()), `Welcome, ${name.trim()}`)}>
        <Fingerprint className="size-5" /> Secure with Face ID or fingerprint
      </Button>
      {!supported && <p className="mt-3 text-sm text-down">This browser doesn’t support passkeys. Try Chrome, Safari or Edge, or use a crypto wallet.</p>}
      <p className="mt-6 text-center text-[15px] text-ink/60">Already have an account? <Link to="/login" className="font-semibold text-ink underline">Log in</Link></p>
      <p className="mt-8 text-[12px] leading-relaxed text-ink/50">By continuing you confirm you are not a US person and that Stock Tokens are available where you live. Testnet prototype, no real money.</p>
    </AuthFrame>
  );
}

export function Login() {
  const { busy, error, run } = useSignIn();
  const profile = loadProfile();
  const { setSession } = useApp();
  const returning = profile && profile.kind !== 'wallet';
  return (
    <AuthFrame side={
      <div className="flex h-full flex-col items-center justify-center gap-10 px-16 [--art-bg:#0a0a0a]">
        <IsoArt kind="rings" size={360} stroke="#f4f4f2" />
        <p className="serif max-w-[14ch] text-center text-[44px] leading-[1.05] text-white">Welcome back to your portfolio</p>
      </div>
    }>
      <h1 className="text-[32px] font-medium leading-tight tracking-[-0.01em]">{returning && profile.name ? `Welcome back, ${profile.name}` : 'Log in to GiFTED!'}</h1>
      <p className="mt-2 text-[15px] text-ink/60">{returning ? 'Unlock with the passkey on this device.' : 'Use the passkey you created when you signed up.'}</p>
      {error && <div className="mt-6"><Notice tone="down">{error}</Notice></div>}
      <Button size="lg" block className="mt-8 !bg-ink !text-white" loading={busy === 'passkey'} onClick={() => run('passkey', profile?.kind === 'demo' ? signInDemo : signInWithPasskey)} data-testid="login-passkey">
        <Fingerprint className="size-5" /> {returning ? 'Unlock with passkey' : 'Continue with passkey'}
      </Button>
      <div className="my-6 flex items-center gap-3 text-[13px] text-ink/40"><span className="h-px flex-1 bg-ink/10" />or<span className="h-px flex-1 bg-ink/10" /></div>
      <Button size="lg" block variant="secondary" className="!bg-ink/5 !text-ink" loading={busy === 'wallet'} onClick={() => run('wallet', signInWithWallet)}><Wallet className="size-5" /> Use a crypto wallet</Button>
      {localDemo && <Button size="lg" block variant="ghost" className="mt-3 !text-ink" loading={busy === 'demo'} onClick={() => run('demo', signInDemo, 'Signed in to the demo account')}><ShieldCheck className="size-5" /> Explore with a demo account</Button>}
      <p className="mt-8 text-center text-[15px] text-ink/60">Not on GiFTED! yet? <Link to="/signup" className="font-semibold text-ink underline">Create an account</Link></p>
      {returning && <button className="mt-3 w-full text-center text-[13px] text-ink/50 hover:text-ink" onClick={() => { signOut(); setSession(null); location.assign('/login'); }}>Not you? Use a different account</button>}
    </AuthFrame>
  );
}
