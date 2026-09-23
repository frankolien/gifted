import type { Abi, Address } from 'viem';
import { chain } from './config';
import { ensureGas, publicClient, triggerTick } from './chain';
import type { Session } from '../account/session';

export interface Call { address: Address; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[]; label: string }
export interface StepUpdate { index: number; total: number; label: string; state: 'signing' | 'pending' | 'done'; hash?: `0x${string}` }

/** Run calls in order. Local (passkey) accounts sign silently; browser wallets prompt once per call. */
export async function execute(session: Session, calls: Call[], onStep?: (s: StepUpdate) => void) {
  await ensureGas(session.address);
  const hashes: `0x${string}`[] = [];
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    onStep?.({ index: i, total: calls.length, label: c.label, state: 'signing' });
    const { request } = await publicClient.simulateContract({ address: c.address, abi: c.abi as Abi, functionName: c.functionName, args: c.args as any, account: session.wallet.account ?? session.address, chain });
    const hash = await session.wallet.writeContract(request as any);
    onStep?.({ index: i, total: calls.length, label: c.label, state: 'pending', hash });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== 'success') throw new Error('Transaction reverted');
    hashes.push(hash);
    onStep?.({ index: i, total: calls.length, label: c.label, state: 'done', hash });
  }
  if (calls.some((c) => c.functionName === 'createPlan' || c.functionName === 'createOrder')) triggerTick(true); // run it right away if it's already due
  return hashes;
}
