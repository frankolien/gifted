import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useApp } from './state';
import { Shell, Toasts, Logo, StockSearch } from './components/Shell';
import { Link } from 'react-router-dom';
import { Sheet } from './components/ui';
import { Landing } from './screens/Landing';
import { Signup, Login } from './screens/Auth';
import { Home, Invest } from './screens/Home';
import { Stock } from './screens/Stock';
import { Activity } from './screens/Activity';
import { Account } from './screens/Account';
import { TradeFlow } from './flows/TradeFlow';
import { AddMoney, Withdraw, BuyingPower } from './flows/Money';
import { ManagePlan, ManageOrder, ActivityDetail } from './flows/Manage';
import { brokerAddress, rpcUrl } from './lib/config';

function Sheets() {
  const { sheet, open, close } = useApp();
  if (!sheet) return null;
  const titles: Record<string, string> = { add: 'Add money', withdraw: 'Withdraw', 'buying-power': 'Buying power', plan: 'Recurring investment', order: 'Limit order', activity: 'Details', trade: '' };
  return (
    <Sheet open onClose={close} title={titles[sheet.type]}>
      {sheet.type === 'trade' && <TradeFlow key={sheet.symbol + sheet.side} symbol={sheet.symbol} initialSide={sheet.side} initialMode={sheet.mode} onClose={close} />}
      {sheet.type === 'add' && <AddMoney onClose={close} />}
      {sheet.type === 'withdraw' && <Withdraw onClose={close} />}
      {sheet.type === 'buying-power' && <BuyingPower onAdd={() => open({ type: 'add' })} onWithdraw={() => open({ type: 'withdraw' })} />}
      {sheet.type === 'plan' && <ManagePlan id={sheet.id} onClose={close} />}
      {sheet.type === 'order' && <ManageOrder id={sheet.id} onClose={close} />}
      {sheet.type === 'activity' && <ActivityDetail itemKey={sheet.key} />}
    </Sheet>
  );
}

function Setup() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <Logo className="text-3xl" />
      <h1 className="mt-8 text-2xl font-bold">This app isn’t connected to a deployment yet</h1>
      <p className="mt-3 text-muted">Set <code>VITE_BROKER_ADDRESS</code> in <code>app/.env.local</code>, or run the one-command local demo:</p>
      <pre className="mt-4 rounded-2xl bg-bg-2 p-4 text-sm">npm run demo --prefix app</pre>
      <p className="mt-4 text-xs text-faint">RPC: {rpcUrl}</p>
    </div>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-4 sm:px-6">
          <Link to="/" aria-label="GiFTED! home"><Logo className="text-xl" /></Link>
          <div className="hidden flex-1 md:block"><StockSearch /></div>
          <nav className="ml-auto flex items-center gap-5 text-[15px] font-semibold"><Link to="/login" className="hover:text-up">Log in</Link><Link to="/signup" className="rounded-full bg-fg px-4 py-2 text-bg">Sign up</Link></nav>
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-4 sm:px-6">{children}</main>
    </div>
  );
}

export function App() {
  const { session, restoring, marketError, market } = useApp();
  if (!brokerAddress) return <Setup />;
  if (restoring) return <div className="grid min-h-dvh place-items-center"><Logo className="text-3xl animate-pulse" /></div>;
  if (!session) {
    return (
      <BrowserRouter>
        <Toasts />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/stocks/:symbol" element={<PublicShell><Stock /></PublicShell>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }
  return (
    <BrowserRouter>
      <Shell>
        {marketError && !market ? <div className="py-20 text-center"><p className="font-semibold">We can’t reach the network right now.</p><p className="mt-1 text-sm text-muted">We’ll keep trying. Your money is safe.</p></div> : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/invest" element={<Invest />} />
            <Route path="/stocks/:symbol" element={<Stock />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/account" element={<Account />} />
            <Route path="/signup" element={<Navigate to="/" replace />} />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </Shell>
      <Sheets />
      <Toasts />
    </BrowserRouter>
  );
}
