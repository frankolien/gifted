import { BaseError, ContractFunctionRevertedError } from 'viem';

const reasons: Record<string, string> = {
  balance: "You don't have enough buying power for this. Add money and try again.",
  order: "You don't have enough buying power to set this money aside. Add money first.",
  plan: 'Check the amount and how often it repeats.',
  bounds: 'Check the price and dates you entered.',
  offline: 'Trading is temporarily unavailable. Your money is safe and you can still withdraw.',
  'oracle paused': "This stock's price is paused for a corporate action. Try again later.",
  stale: 'Live prices are delayed right now, so we can’t trade at a fair price. Try again shortly, or place a limit order.',
  'oracle answer': 'We couldn’t get a valid price for this stock right now.',
  price: 'The price moved above your limit.',
  slippage: 'The price moved too much while your order was processing. Nothing was charged. Please try again.',
  inactive: 'This order is no longer open.',
  user: 'This can no longer be changed.',
  dust: 'That amount is too small. Try a larger amount.',
  transfer: 'The transfer did not go through. Check your balance and try again.',
  allowance: 'Approval is missing. Please try again.',
  funds: "You don't have enough in your wallet for this.",
  'fee token': 'This token is not supported.',
};

function isRejected(e: unknown) {
  let cur: any = e;
  for (let i = 0; i < 6 && cur; i++) {
    if (cur.code === 4001 || /user (rejected|denied)|rejected the request|NotAllowedError|cancelled|canceled/i.test(cur.message || cur.name || '')) return true;
    cur = cur.cause;
  }
  return false;
}

export function humanize(e: unknown): string {
  if (!e) return 'Something went wrong.';
  if (isRejected(e)) return 'Cancelled.';
  const msg: string = (e as any).shortMessage || (e as any).message || String(e);
  if (/insufficient funds|gas required exceeds/i.test(msg)) return 'Your account needs a little gas to continue. We’re topping it up. Please try again in a moment.';
  if (/Failed to fetch|NetworkError|fetch failed|HTTP request failed|ECONNREFUSED/i.test(msg)) return 'We can’t reach the network right now. Check your connection and try again.';
  if (/chain mismatch|does not match the target chain/i.test(msg)) return 'Your wallet is on a different network. Switch networks and try again.';
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const reason = r?.reason || (r?.data?.args?.[0] as string | undefined);
    if (reason) return reasons[reason] || 'The transaction couldn’t be completed. Nothing was charged.';
  }
  const m = msg.match(/reverted with reason string '([^']+)'|reason:\s*([^\n]+)/);
  const reason = m?.[1] || m?.[2];
  if (reason && reasons[reason.trim()]) return reasons[reason.trim()];
  return 'Something went wrong. Nothing was charged. Please try again.';
}
