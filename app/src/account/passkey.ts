import { keccak256, concatBytes, toBytes, bytesToHex, type Hex } from 'viem';
import { generatePrivateKey } from 'viem/accounts';

/**
 * Passkey accounts, no seed phrase.
 *
 * The account key is derived from the passkey's PRF (WebAuthn pseudo-random function) output, so the
 * same passkey (synced by iCloud Keychain, Google Password Manager, 1Password, ...) always unlocks the
 * same account on any device. The key never leaves the browser and is never stored in plain text.
 *
 * If the authenticator does not support PRF, we fall back to a key generated on this device and stored
 * locally, still gated by a passkey check. The app tells the user this account lives on this device only.
 */

const RP_NAME = 'GiFTED!';
const PRF_SALT = new TextEncoder().encode('gifted.account.v1');
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export const passkeysSupported = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;

function keyFromPrf(prf: ArrayBuffer): Hex {
  return keccak256(concatBytes([new Uint8Array(prf), toBytes('gifted-account-key-v1')]));
}

function prfResult(cred: PublicKeyCredential): ArrayBuffer | null {
  const ext = cred.getClientExtensionResults() as any;
  return ext?.prf?.results?.first ?? null;
}

async function assert(credentialId?: string): Promise<{ id: string; prf: ArrayBuffer | null }> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      userVerification: 'required',
      timeout: 60_000,
      allowCredentials: credentialId ? [{ type: 'public-key', id: unb64(credentialId) }] : [],
      extensions: { prf: { eval: { first: PRF_SALT } } } as any,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey sign-in was cancelled.');
  return { id: b64(cred.rawId), prf: prfResult(cred) };
}

export interface PasskeyResult { credentialId: string; privateKey: Hex; portable: boolean }

export async function createPasskeyAccount(displayName: string): Promise<PasskeyResult> {
  if (!passkeysSupported()) throw new Error('This browser does not support passkeys.');
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: RP_NAME, id: location.hostname },
      user: { id: userId, name: displayName || 'GiFTED! account', displayName: displayName || 'GiFTED! account' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      timeout: 60_000,
      extensions: { prf: { eval: { first: PRF_SALT } } } as any,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey creation was cancelled.');
  const credentialId = b64(cred.rawId);
  let prf = prfResult(cred);
  // Many authenticators only return PRF output on assertion, not on creation.
  if (!prf) prf = (await assert(credentialId)).prf;
  if (prf) return { credentialId, privateKey: keyFromPrf(prf), portable: true };
  const privateKey = generatePrivateKey();
  localStorage.setItem(`gifted.devicekey.${credentialId}`, privateKey);
  return { credentialId, privateKey, portable: false };
}

/** Unlock with a passkey. Pass a credential id to target a known account, or omit to let the user pick. */
export async function unlockPasskey(credentialId?: string): Promise<PasskeyResult> {
  const { id, prf } = await assert(credentialId);
  if (prf) return { credentialId: id, privateKey: keyFromPrf(prf), portable: true };
  const stored = localStorage.getItem(`gifted.devicekey.${id}`) as Hex | null;
  if (!stored) throw new Error('This passkey’s account was created on another device. Sign in there, or use a passkey provider that syncs (iCloud Keychain, Google Password Manager).');
  return { credentialId: id, privateKey: stored, portable: false };
}

export const _test = { b64, bytesToHex };
