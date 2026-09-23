import { useEffect } from 'react';
import { Delete } from 'lucide-react';
import { cx } from './ui';

/** Big dollar amount with an on-screen keypad (phones) and full keyboard support (desktop). */
export function AmountPad({ value, onChange, prefix = '$', presets = [], maxDecimals = 2, error, caption }: {
  value: string; onChange: (v: string) => void; prefix?: string; presets?: { label: string; value: string }[]; maxDecimals?: number; error?: string | null; caption?: React.ReactNode;
}) {
  const press = (k: string) => {
    if (k === 'back') return onChange(value.slice(0, -1));
    if (k === '.') { if (value.includes('.') || maxDecimals === 0) return; return onChange((value || '0') + '.'); }
    const [, dec] = value.split('.');
    if (dec !== undefined && dec.length >= maxDecimals) return;
    if (value === '0') return onChange(k);
    if (value.replace('.', '').length >= 9) return;
    onChange(value + k);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
      if (/^[0-9]$/.test(e.key)) { press(e.key); e.preventDefault(); }
      else if (e.key === '.' || e.key === ',') { press('.'); e.preventDefault(); }
      else if (e.key === 'Backspace') { press('back'); e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const display = value || '0';
  const size = display.length > 8 ? 'text-5xl' : 'text-6xl';
  return (
    <div>
      <div className="py-6 text-center">
        <div data-testid="amount" aria-live="polite" className={cx('num font-bold tracking-tight', size, !value && 'text-faint', error && 'text-down')}>{prefix}{display}</div>
        <div className={cx('mt-2 min-h-5 text-sm', error ? 'text-down' : 'text-muted')}>{error || caption}</div>
      </div>
      {presets.length > 0 && (
        <div className="mb-3 flex justify-center gap-2">
          {presets.map((p) => <button key={p.label} onClick={() => onChange(p.value)} className="h-8 rounded-full bg-bg-2 px-3.5 text-[13px] font-semibold hover:bg-line">{p.label}</button>)}
        </div>
      )}
      <div className="grid grid-cols-3 gap-1 sm:hidden" aria-label="Keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map((k) => (
          <button key={k} onClick={() => press(k)} aria-label={k === 'back' ? 'Delete' : k} className="h-14 rounded-2xl text-2xl font-medium active:bg-bg-2">
            {k === 'back' ? <Delete className="mx-auto size-6" /> : k}
          </button>
        ))}
      </div>
      <p className="hidden sm:block text-center text-xs text-faint">Type an amount with your keyboard</p>
    </div>
  );
}
