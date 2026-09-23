#!/usr/bin/env node
/**
 * Deploy GiFTED! to Robinhood Chain testnet (46630) and configure everything the app needs.
 *
 *   npm run testnet --prefix app            # first run creates a deployer key and tells you what to fund
 *   npm run testnet --prefix app            # second run deploys, funds the venue, writes env files
 *   npm run relayer:testnet --prefix app    # keeper + live prices + gas sponsor
 *
 * The key is stored in .secrets/testnet.env (git-ignored). It is a TESTNET key: never send real funds to it.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPublicClient, createWalletClient, http, formatEther, formatUnits, defineChain, parseEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const root = path.dirname(appDir);
const RPC = process.env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const EXPLORER = 'https://explorer.testnet.chain.robinhood.com';
const USDG = '0x7E955252E15c84f5768B83c41a71F9eba181802F';
const STOCKS = { TSLA: '0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E', AMZN: '0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02', PLTR: '0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0', NFLX: '0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93', AMD: '0x71178BAc73cBeb415514eB542a8995b82669778d' };
const chain = defineChain({ id: 46630, name: 'Robinhood Chain Testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } });
const pub = createPublicClient({ chain, transport: http(RPC) });
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];

// ---------------------------------------------------------------- key
const secretsDir = path.join(root, '.secrets');
const keyFile = path.join(secretsDir, 'testnet.env');
if (!existsSync(keyFile)) {
  mkdirSync(secretsDir, { recursive: true });
  const key = generatePrivateKey();
  writeFileSync(keyFile, `# GiFTED! testnet deployer (Robinhood Chain testnet only). Never use on mainnet.\nDEPLOYER_PRIVATE_KEY=${key}\n`, { mode: 0o600 });
}
const key = readFileSync(keyFile, 'utf8').match(/DEPLOYER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/)[1];
const me = privateKeyToAccount(key);
const wallet = createWalletClient({ chain, account: me, transport: http(RPC) });

// ---------------------------------------------------------------- balances
const eth = await pub.getBalance({ address: me.address });
const usdg = await pub.readContract({ address: USDG, abi: erc20, functionName: 'balanceOf', args: [me.address] });
const stocks = Object.fromEntries(await Promise.all(Object.entries(STOCKS).map(async ([s, a]) => [s, await pub.readContract({ address: a, abi: erc20, functionName: 'balanceOf', args: [me.address] })])));
console.log(`\nDeployer ${me.address}`);
console.log(`  ETH  ${formatEther(eth)}\n  USDG ${formatUnits(usdg, 6)}\n  ${Object.entries(stocks).map(([s, b]) => `${s} ${formatUnits(b, 18)}`).join('  ')}\n`);
if (eth < parseEther('0.002')) {
  console.log(`Fund this address first (testnet only, free):
  1. ETH + Stock Tokens: ${'https://faucet.testnet.chain.robinhood.com'}  (paste ${me.address})
  2. USDG:               https://faucet.paxos.com/?network=robinhood
Then run this command again.\n`);
  process.exit(0);
}

// ---------------------------------------------------------------- deploy
console.log('▸ Deploying broker, venue and 5 reference price feeds…');
const useTestDollar = usdg === 0n || process.env.USE_TEST_DOLLAR === 'true';
if (useTestDollar) console.log('  No USDG on the deployer: settling in the faucet-enabled GiFTED test dollar (tUSD).');
const out = spawnSync('forge', ['script', 'contracts/script/DeployTestnet.s.sol:DeployTestnet', '--rpc-url', RPC, '--broadcast', '--slow'], { cwd: root, encoding: 'utf8', env: { ...process.env, DEPLOYER_PRIVATE_KEY: key, USE_TEST_DOLLAR: String(useTestDollar) } });
if (out.status !== 0) { console.error(out.stdout, out.stderr); process.exit(1); }
const grab = (k) => out.stdout.match(new RegExp(`${k}: (0x[0-9a-fA-F]{40})`))?.[1];
const broker = grab('BROKER'), router = grab('ROUTER'), stable = grab('STABLE') || USDG;
const feeds = Object.fromEntries(Object.keys(STOCKS).map((s) => [s, grab(`FEED ${s}`)]));
if (!broker || !router) { console.error(out.stdout); process.exit(1); }
const startBlock = (await pub.getBlockNumber()) - 200n;
console.log(`  broker ${broker}\n  router ${router}\n  dollar ${stable}`);

// ---------------------------------------------------------------- inventory
console.log('▸ Moving Stock Tokens and USDG into the venue so trades can fill…');
for (const [s, a] of Object.entries(STOCKS)) {
  if (stocks[s] > 0n) { const h = await wallet.writeContract({ address: a, abi: erc20, functionName: 'transfer', args: [router, stocks[s]] }); await pub.waitForTransactionReceipt({ hash: h }); console.log(`  ${s} ${formatUnits(stocks[s], 18)}`); }
}
if (!useTestDollar && usdg > 0n) { const h = await wallet.writeContract({ address: USDG, abi: erc20, functionName: 'transfer', args: [router, usdg] }); await pub.waitForTransactionReceipt({ hash: h }); console.log(`  USDG ${formatUnits(usdg, 6)}`); }

// ---------------------------------------------------------------- gas sponsor key (separate so it never races the keeper's nonces)
const dripFile = path.join(secretsDir, 'drip.env');
if (!existsSync(dripFile)) writeFileSync(dripFile, `DRIP_PRIVATE_KEY=${generatePrivateKey()}\n`, { mode: 0o600 });
const dripKey = readFileSync(dripFile, 'utf8').match(/DRIP_PRIVATE_KEY=(0x[0-9a-fA-F]{64})/)[1];
const dripAddr = privateKeyToAccount(dripKey).address;
const left = await pub.getBalance({ address: me.address });
const share = left * 45n / 100n;
{ const h = await wallet.sendTransaction({ to: dripAddr, value: share }); await pub.waitForTransactionReceipt({ hash: h }); }
console.log(`▸ Gas sponsor ${dripAddr} funded with ${formatEther(share)} ETH`);

// ---------------------------------------------------------------- env files
const relayerUrl = process.env.RELAYER_URL || '/api';
writeFileSync(path.join(appDir, '.env.production.local'), [
  '# Generated by npm run testnet', `VITE_BROKER_ADDRESS=${broker}`, `VITE_RPC_URL=${RPC}`, 'VITE_CHAIN_ID=46630', `VITE_EXPLORER_URL=${EXPLORER}`,
  `VITE_RELAYER_URL=${relayerUrl}`, `VITE_START_BLOCK=${startBlock}`, 'VITE_NGN_PER_USD=1500', 'VITE_DEMO_MODE=false', '',
].join('\n'));
writeFileSync(path.join(secretsDir, 'relayer.testnet.env'), [
  `BROKER_ADDRESS=${broker}`, `RPC_URL=${RPC}`, 'CHAIN_ID=46630',
  `KEEPER_PRIVATE_KEY=${key}`, 'KEEPER_INTERVAL_MS=10000',
  `PRICE_PRIVATE_KEY=${key}`, 'PRICE_SOURCE=live', 'PRICE_INTERVAL_MS=60000', 'SEED_HISTORY=1',
  `DRIP_PRIVATE_KEY=${dripKey}`, 'DRIP_ETH=0.0001', 'DRIP_MIN_ETH=0.00002', 'PORT=8788', '',
].join('\n'), { mode: 0o600 });

const rows = [['GiftedBroker', broker], ['InventoryRouter', router], ...(useTestDollar ? [['TestDollar (tUSD)', stable]] : []), ...Object.entries(feeds).map(([s, a]) => [`ReferenceFeed ${s}`, a])];
const table = rows.map(([n, a]) => `| Robinhood Chain testnet (46630) | ${n} | [${a}](${EXPLORER}/address/${a}) | Deployed ${new Date().toISOString().slice(0, 10)} |`).join('\n');
const dep = path.join(root, 'docs', 'deployments.md');
writeFileSync(dep, readFileSync(dep, 'utf8').replace(/\| Robinhood Chain testnet \(46630\) \| GiftedBroker[\s\S]*?ReferenceFeed ×5 \| — \| Not deployed \|/, table));

console.log(`\n✓ Deployed. Next:
  npm run relayer:testnet --prefix app      # starts keeper, live prices (backfills history) and gas sponsor
  npm run build:testnet --prefix app         # production build pointed at testnet (dist/)
Explorer: ${EXPLORER}/address/${broker}\n`);
