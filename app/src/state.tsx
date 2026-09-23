import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseEventLogs } from 'viem';
import { publicClient } from './lib/chain';
import { brokerAbi } from './lib/abi';
import { brokerAddress } from './lib/config';
import { usd, toNum, shares as fmtShares } from './lib/format';
import { restoreSession, type Session } from './account/session';
import { useActivity, useMarket, usePortfolio, type Market, type Portfolio, type ActivityItem } from './lib/data';

export type SheetState =
  | { type: 'trade'; symbol: string; side: 'buy' | 'sell'; mode?: 'now' | 'recurring' | 'limit' }
  | { type: 'add' } | { type: 'withdraw' } | { type: 'buying-power' }
  | { type: 'plan'; id: string } | { type: 'order'; id: string } | { type: 'activity'; key: string }
  | null;

export interface Toast { id: number; title: string; body?: string; tone: 'success' | 'error' | 'info' }
type Theme = 'system' | 'light' | 'dark';

interface AppState {
  session: Session | null; setSession: (s: Session | null) => void; restoring: boolean;
  market?: Market; marketError: unknown; portfolio?: Portfolio; activity?: ActivityItem[];
  sheet: SheetState; open: (s: SheetState) => void; close: () => void;
  toasts: Toast[]; toast: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void;
  theme: Theme; setTheme: (t: Theme) => void;
  showNgn: boolean; setShowNgn: (v: boolean) => void;
}
const Ctx = createContext<AppState | null>(null);
export const useApp = () => { const c = useContext(Ctx); if (!c) throw new Error('AppProvider missing'); return c; };

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<Theme>(read('gifted.theme', 'system') as Theme);
  const [showNgn, setShowNgnState] = useState(read('gifted.ngn', '1') === '1');

  useEffect(() => { restoreSession().then(setSession).finally(() => setRestoring(false)); }, []);
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  const market = useMarket();
  const portfolio = usePortfolio(session?.address, market.data);
  const activity = useActivity(session?.address);

  // Real time: refresh on every new block (throttled) and announce automated fills the moment they land.
  const qc = useQueryClient();
  const lastRefresh = useRef(0);
  useEffect(() => {
    if (!brokerAddress) return;
    return publicClient.watchBlockNumber({ pollingInterval: 1500, emitOnBegin: false, onBlockNumber: () => {
      if (Date.now() - lastRefresh.current < 2500) return;
      lastRefresh.current = Date.now();
      qc.invalidateQueries({ queryKey: ['market'] }); qc.invalidateQueries({ queryKey: ['portfolio'] });
    } });
  }, [qc]);
  const marketRef = useRef(market.data); marketRef.current = market.data;
  useEffect(() => {
    if (!brokerAddress || !session) return;
    return publicClient.watchContractEvent({ address: brokerAddress, abi: brokerAbi, eventName: 'Bought', args: { user: session.address }, pollingInterval: 2000, onLogs: (logs) => {
      const m = marketRef.current;
      for (const l of parseEventLogs({ abi: brokerAbi, logs }) as any[]) {
        if (Number(l.args.source) === 0) continue; // the user's own instant buy already shows a confirmation
        const sym = m?.assets.find((a) => a.address.toLowerCase() === l.args.asset.toLowerCase())?.symbol ?? '';
        const kind = Number(l.args.source) === 1 ? 'Recurring buy' : 'Limit order';
        toast({ tone: 'success', title: `${kind} filled`, body: `You bought ${fmtShares(Number(l.args.received) / 1e18)} ${sym} for ${usd(toNum(l.args.spent, m?.stableDecimals ?? 6))}.` });
      }
      qc.invalidateQueries();
    } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.address, qc]);

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.tone === 'error' ? 9000 : 4500);
  }, []);
  const value = useMemo<AppState>(() => ({
    session, setSession, restoring,
    market: market.data, marketError: market.error, portfolio: portfolio.data, activity: activity.data,
    sheet, open: setSheet, close: () => setSheet(null),
    toasts, toast, dismiss: (id) => setToasts((xs) => xs.filter((x) => x.id !== id)),
    theme, setTheme: (t) => { write('gifted.theme', t); setThemeState(t); },
    showNgn, setShowNgn: (v) => { write('gifted.ngn', v ? '1' : '0'); setShowNgnState(v); },
  }), [session, restoring, market.data, market.error, portfolio.data, activity.data, sheet, toasts, toast, theme, showNgn]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
