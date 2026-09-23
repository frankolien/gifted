import { createWalletClient, custom, http, type Address, type Hex, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { chain, rpcUrl, localDemo, DEMO_ACCOUNT_KEY } from '../lib/config';
import { createPasskeyAccount, unlockPasskey } from './passkey';

export type AccountKind = 'passkey' | 'device' | 'wallet' | 'demo';
export interface Profile { kind: AccountKind; address: Address; name: string; credentialId?: string; createdAt: number }
export interface Session { profile: Profile; wallet: WalletClient; address: Address }

const PROFILE = 'gifted.profile';
const UNLOCKED = 'gifted.unlocked';

export const loadProfile = (): Profile | null => { try { return JSON.parse(localStorage.getItem(PROFILE) || 'null'); } catch { return null; } };
const saveProfile = (p: Profile) => localStorage.setItem(PROFILE, JSON.stringify(p));

function localWallet(key: Hex) {
  return createWalletClient({ chain, account: privateKeyToAccount(key), transport: http(rpcUrl) });
}

function remember(key: Hex) { try { sessionStorage.setItem(UNLOCKED, key); } catch { /* private mode */ } }

export async function signUpWithPasskey(name: string): Promise<Session> {
  const r = await createPasskeyAccount(name);
  const wallet = localWallet(r.privateKey);
  const profile: Profile = { kind: r.portable ? 'passkey' : 'device', address: wallet.account!.address, name, credentialId: r.credentialId, createdAt: Date.now() };
  saveProfile(profile); remember(r.privateKey);
  return { profile, wallet, address: profile.address };
}

export async function signInWithPasskey(): Promise<Session> {
  const known = loadProfile();
  const r = await unlockPasskey(known?.kind === 'passkey' || known?.kind === 'device' ? known.credentialId : undefined);
  const wallet = localWallet(r.privateKey);
  const address = wallet.account!.address;
  const profile: Profile = known && known.address === address ? known : { kind: r.portable ? 'passkey' : 'device', address, name: known?.name && known.address === address ? known.name : '', credentialId: r.credentialId, createdAt: Date.now() };
  saveProfile(profile); remember(r.privateKey);
  return { profile, wallet, address };
}

export function signInDemo(): Session {
  if (!localDemo) throw new Error('Demo accounts are only available on the local demo.');
  const wallet = localWallet(DEMO_ACCOUNT_KEY);
  const profile: Profile = { kind: 'demo', address: wallet.account!.address, name: 'Demo investor', createdAt: Date.now() };
  saveProfile(profile); remember(DEMO_ACCOUNT_KEY);
  return { profile, wallet, address: profile.address };
}

export async function signInWithWallet(): Promise<Session> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error('No browser wallet found. Install MetaMask or Rabby, or create an account with a passkey instead.');
  const wallet = createWalletClient({ chain, transport: custom(eth) });
  const [address] = await wallet.requestAddresses();
  try { await wallet.switchChain({ id: chain.id }); } catch { await wallet.addChain({ chain }); await wallet.switchChain({ id: chain.id }); }
  const profile: Profile = { kind: 'wallet', address, name: '', createdAt: Date.now() };
  saveProfile(profile);
  return { profile, wallet: createWalletClient({ chain, account: address, transport: custom(eth) }), address };
}

/** Restore without prompting: the unlocked key lives in sessionStorage for this tab only. */
export async function restoreSession(): Promise<Session | null> {
  const profile = loadProfile();
  if (!profile) return null;
  if (profile.kind === 'wallet') {
    const eth = (window as any).ethereum;
    if (!eth) return null;
    const accounts: string[] = await eth.request({ method: 'eth_accounts' }).catch(() => []);
    if (!accounts.map((a) => a.toLowerCase()).includes(profile.address.toLowerCase())) return null;
    return { profile, wallet: createWalletClient({ chain, account: profile.address, transport: custom(eth) }), address: profile.address };
  }
  const key = (() => { try { return sessionStorage.getItem(UNLOCKED) as Hex | null; } catch { return null; } })();
  if (!key) return null;
  const wallet = localWallet(key);
  if (wallet.account!.address !== profile.address) return null;
  return { profile, wallet, address: profile.address };
}

export function lock() { try { sessionStorage.removeItem(UNLOCKED); } catch { /* ignore */ } }
export function signOut() { lock(); localStorage.removeItem(PROFILE); }
export function renameProfile(name: string) { const p = loadProfile(); if (p) saveProfile({ ...p, name }); }
