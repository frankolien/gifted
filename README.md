# GiFTED!

**Invest in US stocks with digital dollars.** GiFTED! is a consumer investing app on Robinhood Chain. People buy fractions of Stock Tokens (TSLA, AMZN, PLTR, NFLX, AMD) with USDG from $1. They can set up recurring investments that run automatically and place limit orders that fill at their price. Stocks stay in the user's own account, which is secured by a passkey instead of a seed phrase.

**Live on Robinhood Chain testnet: https://gifted-invest.vercel.app** · broker [`0x95F9…f5CF`](https://explorer.testnet.chain.robinhood.com/address/0x95F9A731DFCBf3867C60688E5E546867Bf7cf5CF)

> Testnet prototype for the Arbitrum Open House Singapore buildathon. No real money. Stock Tokens give economic exposure only, are not offered to US persons, and are restricted in some jurisdictions.

## Why

Retail investors in markets like Nigeria reach US stocks through custodial apps. Those apps charge around 1.5% commission or FX fees plus a wider FX spread, settle T+1, trade only in US hours, and hold the assets for the user. GiFTED! turns the same experience into on-chain primitives:

| | Typical EM stock app | GiFTED! |
| --- | --- | --- |
| Funding | Naira, converted at the app's FX spread | Digital dollars (USDG), no conversion markup |
| Fees | ~1.5% commission or FX fee | Capped on-chain at 1% (0.25% configured on testnet) |
| Hours | US market hours | Orders 24/7; prices 24/5 |
| Custody | App holds your shares | Stock Tokens are in the user's own account |
| Automation | Limited | Recurring buys, limit orders, price protection |
| Onboarding | Email, BVN, password | Passkey (Face ID / fingerprint), gas sponsored |

## Try it in two minutes

Requires [Foundry](https://getfoundry.sh) and Node 20+.

```sh
npm install --prefix app
npm run demo --prefix app
```

This starts a local chain and deploys the contracts with 90 days of price history. It then starts the relayer (keeper, simulated market, gas sponsor) and the app. Open the printed URL, then:

1. **Get started**, type your name, and **Secure with Face ID or fingerprint**. This creates a passkey account with no seed phrase and no gas to buy. You can also choose **Explore with a demo account**.
2. **Add money** from the test bank.
3. Open a stock and **Buy**. You get the dollar keypad, a review, and a confirmation showing the exact shares filled.
4. Choose **Recurring** for a daily or weekly buy that runs automatically, or **Limit** to buy only at your price.
5. Under **Account → Demo tools**, drop a price by 10% or skip ahead a day, and watch the orders execute in **Activity**.

## Product

- **Onboarding:** Passkey sign-up asks only for a first name. The account key is derived from the passkey's WebAuthn PRF output, so the same synced passkey (iCloud Keychain, Google Password Manager) restores the same account on any device. The key never leaves the browser. Browser wallets (MetaMask, Rabby) are supported as an alternative.
- **Home:** Shows portfolio value with the day's change, a scrubbable chart (1D/1W/1M/3M/ALL), buying power, scheduled investments, holdings and discovery.
- **Stock page:** Shows live price and chart, plus a position block with shares, market value, average cost, portfolio diversity, today's return and total return. It also has scheduled orders, an About section and stats. On desktop an order panel sits beside the chart; on phones a Buy and Sell bar is pinned to the bottom.
- **Trading:**
  - **Buy now** and **Sell** fill atomically at the oracle price, within 1%.
  - **Recurring investments** run every day, week, 2 weeks or month. They can start today, tomorrow or next week, have optional price protection, and can be paused, resumed or ended.
  - **Limit buys** can be good for 24 hours or good till canceled (90 days).
  - If buying power is short, the app tops up from the user's USDG wallet automatically.
- **Money:** Add money and withdraw to your wallet or any address. Every transfer shows an indicative naira equivalent.
- **Activity:** A day-grouped history with filters and a receipt for every item.
- **Trust:** System status is written in plain language. Contract errors are translated to human copy, and disclosures appear throughout.
- **Quality:** Light and dark mode, keyboard support, a phone keypad, skeleton loading, accessible dialogs and reduced-motion support.

## Architecture

```
app/                 React + TypeScript + Vite + Tailwind, viem, TanStack Query
  src/account/       passkey (WebAuthn PRF) accounts, sessions, wallet fallback
  src/flows/         trade, money, manage sheets
  server/relayer.js  keeper + gas sponsor (POST /drip) + price publisher, GET /health
contracts/src/
  GiftedBroker.sol   deposits, buyNow/sellNow, recurring plans, limit orders, oracle guards
  InventoryRouter.sol  testnet venue: fills from inventory of real testnet Stock Tokens at the reference price
  DemoAssets.sol     local-only demo tokens, Chainlink-compatible ReferenceFeed with history, demo venue
stylus/              Rust (Stylus) trigger matcher for Arbitrum Sepolia
```

Contract guarantees:

- **Price bounds:** Every execution is bounded by a fresh oracle price. Feeds must be positive, not stale, and the latest round must be complete. The token's `oraclePaused()` is respected, and a revert on that call is handled.
- **Slippage and fees:** Each trade has a user-set slippage limit. The fee is capped at 1%.
- **Balance checks:** Received amounts are measured by balance deltas, which protects against fee-on-transfer tokens.
- **Admin and safety controls:** Reentrancy guard, two-step ownership, pause switch, and a fail-closed sequencer flag.
- **Solvency:** An invariant holds that liabilities, meaning balances plus open order escrow, never exceed the stablecoin held.

## Tests

```sh
forge test                          # 21 unit and fuzz tests + 2 invariants (128k calls each)
cargo test --manifest-path stylus/Cargo.toml
npm run typecheck --prefix app
npm run demo --prefix app           # then, in another terminal:
npm run test:e2e --prefix app       # headless Chrome with a virtual passkey, full user journey
```

## Going live on Robinhood Chain testnet (46630)

Three commands. The first run creates a testnet-only deployer key in `.secrets/` (git-ignored) and tells you what to fund:

```sh
npm run testnet --prefix app          # 1st run: prints the deployer address to fund
# fund it: ETH + Stock Tokens at https://faucet.testnet.chain.robinhood.com, USDG at https://faucet.paxos.com/?network=robinhood
npm run testnet --prefix app          # 2nd run: deploys, stocks the venue, writes env files, updates docs/deployments.md
npm run relayer:testnet --prefix app  # keeper + live market prices (with 3 months of real history) + gas sponsor
npm run build:testnet --prefix app    # static site in app/dist, ready for Vercel or any host
```

The relayer can run anywhere Node runs; `app/Dockerfile.relayer` packages it for container hosts. Set `RELAYER_URL` before the second `npm run testnet` if it will not run on localhost.

Verified before funding: the full deployment was run against a local fork of the live testnet. It used the real TSLA token at the live $378.90 price. A user deposited USDG, bought and sold real testnet TSLA, and the keeper ran a recurring buy and filled a limit order.

Testnet facts, verified 2026-09-23 against the public RPC:

- **Stock Tokens:** TSLA `0xC9f9…Bd4E`, AMZN `0x5884…9E02`, PLTR `0x1FBE…98d0`, NFLX `0x3b82…8C93`, AMD `0x7117…778d`. All use 18 decimals, and `oraclePaused()` reverts.
- **USDG:** `0x7E95…802F`, 6 decimals.
- **Price feeds:** Testnet has **no Chainlink Stock Token feeds**. The deploy creates `ReferenceFeed`s that only the relayer may update, using real market prices.
- **Gas:** about 0.01 gwei.

## Real time

- **Live refresh:** The app refreshes on every new block. When the keeper fills a user's recurring buy or limit order, a notification appears within about two seconds.
- **No dependency on the keeper:** Owners can trigger their own due recurring buy or ready limit order from the app ("Buy now" / "Fill now"). Execution therefore never depends on the keeper being online, and every price and slippage bound still applies.
- **Live prices:** Testnet prices follow the real market every minute. The local demo uses a simulated market so moves are visible.

## Honest limitations

- Testnet prices are real market prices (Yahoo Finance public chart data) published on-chain by the relayer, not Chainlink. Mainnet should point the broker at the official Chainlink feeds.
- The testnet venue is an inventory router, a transparent market-maker stand-in. Mainnet would route to Rialto, Uniswap v4 or RFQ makers.
- Gas is sponsored with a small ETH top-up from the relayer. The next step is an ERC-4337 paymaster: Alchemy lists bundler and gas sponsorship for Robinhood Testnet, and the P-256 precompile is live.
- Users hold unspent cash as a claim in the broker contract. Only they can withdraw it, but the owner controls router and feed configuration. Production needs a multisig, a timelock and an audit. See [docs/threat-model.md](docs/threat-model.md).
- The Stylus matcher is not deployed yet.
