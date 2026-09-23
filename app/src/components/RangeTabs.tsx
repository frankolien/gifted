import { RANGES, type Range } from './Chart';
import { cx } from './ui';

/** Uppercase, letter-spaced range tabs with an underline on the active one. */
export function RangeTabs({ value, onChange, up = true }: { value: Range; onChange: (r: Range) => void; up?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Chart range" className="flex gap-1 border-b border-line">
      {RANGES.map((r) => (
        <button key={r} role="radio" aria-checked={value === r} onClick={() => onChange(r)}
          className={cx('relative px-3 pb-3 pt-2 text-[13px] font-bold tracking-[0.12em] transition', value === r ? (up ? 'text-up' : 'text-down') : 'text-fg/80 hover:text-fg')}>
          {r}
          {value === r && <span className={cx('absolute inset-x-3 -bottom-px h-[2px] rounded-full', up ? 'bg-up' : 'bg-down')} />}
        </button>
      ))}
    </div>
  );
}
