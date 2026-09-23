import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { X, Loader2 } from 'lucide-react';
import { STOCK_INFO } from '../lib/config';
import { useMedia } from '../lib/useMedia';

export function cx(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' '); }

type Variant = 'primary' | 'secondary' | 'ghost' | 'up' | 'danger';
export function Button({ variant = 'primary', size = 'md', loading, block, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; block?: boolean }) {
  const v = {
    primary: 'bg-fg text-bg hover:opacity-90',
    up: 'bg-up text-on-up hover:brightness-105',
    secondary: 'bg-bg-2 text-fg hover:bg-line',
    ghost: 'bg-transparent text-fg hover:bg-bg-2',
    danger: 'bg-down-soft text-down hover:brightness-95',
  }[variant];
  const s = { sm: 'h-9 px-3.5 text-sm', md: 'h-11 px-5 text-[15px]', lg: 'h-14 px-6 text-base' }[size];
  return (
    <button {...rest} disabled={rest.disabled || loading} className={cx('inline-flex items-center justify-center gap-2 rounded-full font-semibold transition disabled:opacity-40 select-none', v, s, block && 'w-full', className)}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}{children}
    </button>
  );
}

/** Company logo on a circular tile; falls back to a ticker monogram for stocks without a bundled logo. */
export function StockLogo({ symbol, color, size = 40 }: { symbol: string; color: string; size?: number }) {
  const bg = STOCK_INFO[symbol]?.logoBg;
  if (bg) return (
    <span aria-hidden className="inline-grid shrink-0 place-items-center overflow-hidden rounded-full ring-1 ring-black/10 dark:ring-white/15" style={{ width: size, height: size, background: bg }}>
      <img src={`/logos/${symbol}.png`} alt="" draggable={false} style={{ width: size * 0.58, height: size * 0.58 }} className="object-contain" />
    </span>
  );
  return (
    <span aria-hidden className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: color, fontSize: size * (symbol.length > 3 ? 0.28 : 0.34) }}>
      {symbol.slice(0, 4)}
    </span>
  );
}

export function Change({ value, pctValue, className, suffix }: { value: number; pctValue?: number; className?: string; suffix?: string }) {
  const up = value >= 0;
  const sign = up ? '+' : '−';
  const abs = Math.abs(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return (
    <span className={cx('num font-medium', up ? 'text-up' : 'text-down', className)} data-testid="change">
      {up ? '▲' : '▼'} {sign}{abs}{pctValue !== undefined && ` (${sign}${Math.abs(pctValue * 100).toFixed(2)}%)`}{suffix && <span className="font-normal text-muted"> {suffix}</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) { return <span className={cx('skeleton inline-block', className)} />; }

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="mb-2 mt-8 flex items-center justify-between"><h2 className="text-xl font-bold tracking-tight">{children}</h2>{action}</div>;
}

/**
 * Desktop (>=1024px): a non-modal panel docked on the left. No overlay, the page stays usable.
 * Phones and tablets: a modal bottom sheet.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const docked = useMedia('(min-width: 1024px)');
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    if (!docked) document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('[data-autofocus], input, button:not([data-close])')?.focus({ preventScroll: true }), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; if (!docked) prev?.focus?.(); };
  }, [open, docked]);
  if (!open) return null;
  const label = typeof title === 'string' && title ? title : 'Panel';
  const head = (
    <div className="sticky top-0 z-10 flex items-center justify-between bg-card/95 px-5 pb-2 pt-4 backdrop-blur">
      <div className="text-[15px] font-semibold">{title}</div>
      <button data-close onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-bg-2"><X className="size-5" /></button>
    </div>
  );
  if (docked) return (
    <aside ref={ref} role="complementary" aria-label={label} data-testid="side-panel"
      className="fixed bottom-4 left-4 top-4 z-40 flex w-[400px] flex-col overflow-y-auto rounded-3xl border border-line bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,.35)] anim-panel">
      {head}<div className="px-5 pb-5">{children}</div>
    </aside>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center anim-fade" role="presentation">
      <div className="absolute inset-0 bg-[var(--overlay)]" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={label}
        className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-card shadow-2xl anim-sheet safe-bottom sm:max-w-md sm:rounded-3xl">
        {head}<div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

export function Row({ label, value, hint, onClick }: { label: ReactNode; value: ReactNode; hint?: ReactNode; onClick?: () => void }) {
  const inner = (<><div className="min-w-0"><div className="text-[15px]">{label}</div>{hint && <div className="mt-0.5 text-sm text-muted">{hint}</div>}</div>
    <div className="num shrink-0 text-right text-[15px] font-medium">{value}</div></>);
  const cls = 'flex w-full items-center justify-between gap-4 border-b border-line py-3.5 text-left last:border-0';
  return onClick ? <button onClick={onClick} className={cx(cls, 'hover:bg-bg-2')}>{inner}</button> : <div className={cls}>{inner}</div>;
}

export function Notice({ tone = 'warn', icon, children }: { tone?: 'warn' | 'info' | 'down'; icon?: ReactNode; children: ReactNode }) {
  const c = { warn: 'bg-warn-soft text-warn', info: 'bg-bg-2 text-muted', down: 'bg-down-soft text-down' }[tone];
  return <div role={tone === 'down' ? 'alert' : undefined} className={cx('flex gap-3 rounded-2xl px-4 py-3 text-sm leading-snug', c)}>{icon}<div className="min-w-0">{children}</div></div>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('h-8 rounded-full px-3 text-[13px] font-semibold transition', value === o.value ? 'bg-fg text-bg' : 'text-muted hover:bg-bg-2 hover:text-fg')}>{o.label}</button>
      ))}
    </div>
  );
}
