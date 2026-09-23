import { defineChain, type Address } from 'viem';

const env = import.meta.env;
const addr = (v: string | undefined) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);

export const rpcUrl: string = env.VITE_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
export const isLocalRpc = /localhost|127\.0\.0\.1/.test(rpcUrl);
/** Demo-only helpers (test money, time travel, demo sign-in) need demo mode AND a local chain. */
export const localDemo = env.VITE_DEMO_MODE === 'true' && isLocalRpc;
export const chainId = Number(env.VITE_CHAIN_ID || 46630);
export const explorerUrl: string | null = isLocalRpc ? null : env.VITE_EXPLORER_URL || 'https://explorer.testnet.chain.robinhood.com';
export const relayerUrl: string | null = env.VITE_RELAYER_URL || null;
export const brokerAddress = addr(env.VITE_BROKER_ADDRESS);
export const startBlock = BigInt(env.VITE_START_BLOCK || 0);
export const ngnPerUsd = Number(env.VITE_NGN_PER_USD || 0) || null;
export const stableFaucetUrl = isLocalRpc ? null : 'https://faucet.paxos.com/?network=robinhood';
export const gasFaucetUrl = isLocalRpc ? null : 'https://faucet.testnet.chain.robinhood.com';

export const chain = defineChain({
  id: chainId,
  name: isLocalRpc ? 'Local demo chain' : chainId === 4663 ? 'Robinhood Chain' : 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  ...(explorerUrl ? { blockExplorers: { default: { name: 'Blockscout', url: explorerUrl } } } : {}),
});

export const SLIPPAGE_BPS = 100; // 1%
export const DEMO_ACCOUNT_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const; // Anvil #1, local only

/** Display metadata. Prices, balances and contracts always come from the chain. */
/** Display metadata. `logoBg` is the tile behind the company logo (public/logos/SYMBOL.png). */
export const STOCK_INFO: Record<string, { name: string; color: string; about: string; sector: string; logoBg?: string }> = {
  TSLA: { name: 'Tesla', color: '#cc2936', logoBg: '#ffffff', sector: 'Automotive', about: 'Tesla designs and makes electric vehicles, battery storage and solar products, and develops self-driving software.' },
  AMZN: { name: 'Amazon', color: '#e88a00', logoBg: '#232f3e', sector: 'Consumer', about: 'Amazon runs a global online store and Amazon Web Services, the largest cloud computing platform.' },
  PLTR: { name: 'Palantir', color: '#3b3f46', logoBg: '#ffffff', sector: 'Software', about: 'Palantir builds data analytics and AI platforms used by governments and large companies.' },
  NFLX: { name: 'Netflix', color: '#b20710', logoBg: '#000000', sector: 'Media', about: 'Netflix is a subscription streaming service with films, series and games in over 190 countries.' },
  AMD: { name: 'AMD', color: '#0b7a75', logoBg: '#000000', sector: 'Semiconductors', about: 'Advanced Micro Devices designs processors and graphics chips for PCs, data centres and gaming consoles.' },
};
