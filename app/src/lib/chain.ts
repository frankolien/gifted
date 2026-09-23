import { createPublicClient, http, parseEther, type Address } from 'viem';
import { chain, rpcUrl, relayerUrl, localDemo } from './config';

export const publicClient = createPublicClient({ chain, transport: http(rpcUrl, { batch: { wait: 16 } }) });

const MIN_GAS = parseEther('0.00002'); // ~25 transactions at Robinhood Chain gas prices

/** Make sure the account can pay for gas, without the user ever thinking about it. */
export async function ensureGas(address: Address): Promise<void> {
  const bal = await publicClient.getBalance({ address });
  if (bal >= MIN_GAS) return;
  if (relayerUrl) {
    const res = await fetch(`${relayerUrl}/drip`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }) }).catch(() => null);
    if (res?.ok) return;
  }
  if (localDemo) {
    await publicClient.request({ method: 'anvil_setBalance' as any, params: [address, '0x2386F26FC10000'] as any }); // 0.01 ETH
    return;
  }
  const after = await publicClient.getBalance({ address });
  if (after < MIN_GAS) throw new Error('insufficient funds for gas');
}

let lastTick = 0;
/** Ask the relayer to refresh prices and run ready orders now (throttled). Fire-and-forget. */
export function triggerTick(force = false) {
  if (!relayerUrl || localDemo) return;
  if (!force && Date.now() - lastTick < 45_000) return;
  lastTick = Date.now();
  fetch(`${relayerUrl}/tick`).catch(() => {});
}

export async function relayerHealth(): Promise<any | null> {
  if (!relayerUrl) return null;
  try { const r = await fetch(`${relayerUrl}/health`); return r.ok ? await r.json() : null; } catch { return null; }
}
