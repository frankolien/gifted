import { formatUnits, parseUnits } from 'viem';
import { ngnPerUsd } from './config';

const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ngnFmt = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 });

export const usd = (n: number) => usdFmt.format(Number.isFinite(n) ? n : 0);
export const ngn = (n: number) => (ngnPerUsd ? `≈ ${ngnFmt.format(n * ngnPerUsd)}` : '');
export const signedUsd = (n: number) => `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`;
export const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(2)}%`;
export const shares = (n: number, max = 6) => new Intl.NumberFormat('en-US', { maximumFractionDigits: n > 0 && n < 1 ? max : 4 }).format(n);
export const toNum = (raw: bigint, decimals: number) => Number(formatUnits(raw, decimals));
export const e18 = (raw: bigint) => Number(formatUnits(raw, 18));
export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

export function parseMoney(text: string, decimals: number): bigint | null {
  const t = text.replace(/[,$\s]/g, '');
  if (!t || !/^\d*\.?\d*$/.test(t) || t === '.') return null;
  try { const v = parseUnits(t, decimals); return v > 0n ? v : null; } catch { return null; }
}

export function frequencyLabel(seconds: number) {
  const map: Record<number, string> = { 86400: 'Every day', 604800: 'Every week', 1209600: 'Every 2 weeks', 2592000: 'Every month', 3600: 'Every hour' };
  return map[seconds] || `Every ${Math.round(seconds / 3600)} hours`;
}

export function dateLabel(ts: number) {
  const d = new Date(ts * 1000); const now = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay(d, now)) return `Today, ${time}`;
  if (sameDay(d, tomorrow)) return `Tomorrow, ${time}`;
  if (sameDay(d, yesterday)) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + `, ${time}`;
}
export function dayHeading(ts: number) {
  const d = new Date(ts * 1000); const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
export function ago(seconds: number) {
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
}
