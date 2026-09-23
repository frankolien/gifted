import { useEffect, useRef, useState, type ReactNode, type ElementType } from 'react';

/** Adds `in` once the element scrolls into view (used for fade-up and line-art draw-in). */
export function useInView<T extends Element>(threshold = 0.2) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!('IntersectionObserver' in window)) { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold, rootMargin: '0px 0px -8% 0px' });
    io.observe(el); return () => io.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
}

export function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }: { as?: ElementType; delay?: 0 | 1 | 2 | 3; className?: string; children: ReactNode } & Record<string, unknown>) {
  const [ref, inView] = useInView<HTMLDivElement>(0.12);
  return <Tag ref={ref} className={`reveal ${delay ? `reveal-d${delay}` : ''} ${inView ? 'in' : ''} ${className}`} {...rest}>{children}</Tag>;
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
/** Odometer-style number: each digit rolls to its new value. */
export function RollingNumber({ value, className = '', testId }: { value: string; className?: string; testId?: string }) {
  return (
    <span className={`roll num ${className}`} aria-label={value} data-testid={testId} data-value={value}>
      {value.split('').map((ch, i) => {
        const d = DIGITS.indexOf(ch);
        if (d < 0) return <span key={`s${i}${ch}`} aria-hidden>{ch}</span>;
        return (
          <span key={`d${value.length - i}`} className="roll-col" aria-hidden>
            <span className="roll-strip" style={{ transform: `translateY(-${d * 1.1}em)` }}>{DIGITS.map((x) => <span key={x}>{x}</span>)}</span>
          </span>
        );
      })}
    </span>
  );
}
