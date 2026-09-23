# Threat model

## Assets and trust boundaries

The broker escrows stablecoin. Users own internal claims on unreserved deposits and reserved limit orders. The keeper can only trigger trades that satisfy onchain price, expiry, timing and slippage constraints. The router is an external execution venue and must be trusted to provide the exact token output. The owner chooses the router and feed registry.

## Controls implemented

- User-initiated `buyNow` and `sellNow` are bounded by the same oracle price and a user-supplied slippage limit (max 10%).
- The Stock Token's `oraclePaused()` is read defensively. A revert, which happens on testnet, is treated as not paused, and a `true` blocks execution.
- `totalLiabilities` tracks balances plus open order escrow. A Foundry invariant checks that it never exceeds stablecoin held and always equals the sum of claims.
- Two-step ownership transfer. Routers accept calls only from the broker. Reference feeds accept updates only from their updater.
- Recurring plans can be paused, resumed without back-filling missed runs, or ended by their owner only.
- Reentrancy guard around deposits, withdrawals and execution.
- Full balance-delta check for stablecoin deposits and Stock Token receipt.
- Limit-order escrow and creator-only cancellation.
- Positive, fresh, unpaused oracle prices; no DEX spot fallback and no double application of the Stock Token UI multiplier.
- Per-order maximum price, slippage and expiry; per-plan maximum price and interval.
- Fee capped at 100 basis points.
- Fail-closed sequencer flag, initially false.

## Remaining risks

- **Testnet reference prices:** On testnet the relayer's updater key publishes prices, because no Chainlink Stock Token feeds exist there. A compromised updater could misprice testnet trades. Mainnet must use Chainlink feeds.
- **Passkey-derived keys:** The account key is derived in the browser from the WebAuthn PRF output and kept in `sessionStorage` for the tab. Malicious script on the app origin (XSS) could read it while unlocked. A strict CSP, no third-party scripts, and a move to ERC-4337 passkey validators (P-256 precompile available) are the mitigations. Authenticators without PRF fall back to a device-local key, and the UI tells the user this.
- **Gas sponsor abuse:** The drip endpoint is rate limited per address and per IP. It should sit behind bot protection or be replaced by a paymaster policy.
- **Admin trust:** owner may replace the router or asset feed. Use a timelock and independent monitoring before handling real assets.
- **Sequencer signal:** the owner currently sets liveness manually. Add an independently verifiable onchain uptime source or hardened monitor.
- **Venue and token restrictions:** a router may fail, provide insufficient output, or encounter a blocked or paused Stock Token. Execution reverts, leaving escrow intact, but the user must cancel a resting order to recover it.
- **Market hours:** a recent price is required. There is no special market calendar. A permissive `maxAge` can allow trading outside the underlying market's hours.
- **Keeper availability:** a single keeper can delay execution. Users can cancel plans and orders, but execution is not permissionless.
- **Price conversion:** feed decimals and stablecoin decimals are normalized. A wrong feed assignment or unusual token mechanics can misprice trades.
- **Legal eligibility:** testnet proof does not establish that Stock Tokens may be offered in Nigeria or elsewhere. Geographic and product eligibility require separate review.

