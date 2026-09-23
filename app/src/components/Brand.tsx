import { cx } from './ui';

/** GiFTED! ribbon G: gift fold, growth path, and forward motion in one mark. */
export function Mark({ className = 'size-7' }: { className?: string; dark?: boolean }) {
  return <img src="/gifted-mark-512.png" className={cx('object-contain', className)} alt="" aria-hidden="true" draggable={false} />;
}
export function Wordmark({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <Mark className="size-7" dark={dark} /><span className={dark ? 'text-white' : ''}>GiFTED!</span>
    </span>
  );
}
export function InfoLine({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 text-[13px] opacity-80', className)}>
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" /><path d="M8 7v4.5M8 4.6v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>{children}
    </span>
  );
}
