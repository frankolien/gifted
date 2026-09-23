export const brokerAbi = [
  { type: 'function', name: 'stable', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'stableDecimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'balances', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'paused', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'sequencerLive', stateMutability: 'view', inputs: [], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'feeBps', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'listAssets', stateMutability: 'view', inputs: [], outputs: [{ type: 'address[]' }] },
  { type: 'function', name: 'assets', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ name: 'feed', type: 'address' }, { name: 'maxAge', type: 'uint32' }, { name: 'enabled', type: 'bool' }] },
  { type: 'function', name: 'priceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ name: 'priceE18', type: 'uint256' }, { name: 'updatedAt', type: 'uint256' }, { name: 'ok', type: 'bool' }] },
  { type: 'function', name: 'plansOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [
    { name: 'ids', type: 'uint256[]' },
    { name: 'out', type: 'tuple[]', components: [
      { name: 'user', type: 'address' }, { name: 'ended', type: 'bool' }, { name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' },
      { name: 'maxPriceE18', type: 'uint256' }, { name: 'interval', type: 'uint64' }, { name: 'nextAt', type: 'uint64' }, { name: 'runs', type: 'uint32' },
      { name: 'maxSlippageBps', type: 'uint16' }, { name: 'active', type: 'bool' },
    ] },
  ] },
  { type: 'function', name: 'ordersOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [
    { name: 'ids', type: 'uint256[]' },
    { name: 'out', type: 'tuple[]', components: [
      { name: 'user', type: 'address' }, { name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'limitPriceE18', type: 'uint256' },
      { name: 'expiry', type: 'uint64' }, { name: 'createdAt', type: 'uint64' }, { name: 'maxSlippageBps', type: 'uint16' }, { name: 'status', type: 'uint8' },
    ] },
  ] },
  { type: 'function', name: 'planReady', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'orderReady', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'executePlan', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'fillOrder', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'deposit', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'buyNow', stateMutability: 'nonpayable', inputs: [{ name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'slippageBps', type: 'uint16' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'sellNow', stateMutability: 'nonpayable', inputs: [{ name: 'asset', type: 'address' }, { name: 'assetIn', type: 'uint256' }, { name: 'slippageBps', type: 'uint16' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'createPlan', stateMutability: 'nonpayable', inputs: [
    { name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'interval', type: 'uint64' }, { name: 'startAt', type: 'uint64' },
    { name: 'maxPriceE18', type: 'uint256' }, { name: 'slippageBps', type: 'uint16' },
  ], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'cancelPlan', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'setPlanPaused', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }, { name: 'pause', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'createOrder', stateMutability: 'nonpayable', inputs: [
    { name: 'asset', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'limitPriceE18', type: 'uint256' }, { name: 'expiry', type: 'uint64' }, { name: 'slippageBps', type: 'uint16' },
  ], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'cancelOrder', stateMutability: 'nonpayable', inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'event', name: 'Deposited', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Withdrawn', inputs: [{ name: 'user', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'PlanCreated', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'user', type: 'address', indexed: true }, { name: 'asset', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'interval', type: 'uint64', indexed: false }, { name: 'firstAt', type: 'uint64', indexed: false }] },
  { type: 'event', name: 'PlanCancelled', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'user', type: 'address', indexed: true }] },
  { type: 'event', name: 'PlanPaused', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'user', type: 'address', indexed: true }, { name: 'paused', type: 'bool', indexed: false }] },
  { type: 'event', name: 'OrderCreated', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'user', type: 'address', indexed: true }, { name: 'asset', type: 'address', indexed: true }, { name: 'amount', type: 'uint256', indexed: false }, { name: 'limitPriceE18', type: 'uint256', indexed: false }, { name: 'expiry', type: 'uint64', indexed: false }] },
  { type: 'event', name: 'OrderCancelled', inputs: [{ name: 'id', type: 'uint256', indexed: true }, { name: 'user', type: 'address', indexed: true }] },
  { type: 'event', name: 'Bought', inputs: [
    { name: 'user', type: 'address', indexed: true }, { name: 'asset', type: 'address', indexed: true }, { name: 'source', type: 'uint8', indexed: false }, { name: 'refId', type: 'uint256', indexed: true },
    { name: 'spent', type: 'uint256', indexed: false }, { name: 'received', type: 'uint256', indexed: false }, { name: 'fee', type: 'uint256', indexed: false }, { name: 'priceE18', type: 'uint256', indexed: false },
  ] },
  { type: 'event', name: 'Sold', inputs: [
    { name: 'user', type: 'address', indexed: true }, { name: 'asset', type: 'address', indexed: true }, { name: 'assetIn', type: 'uint256', indexed: false },
    { name: 'proceeds', type: 'uint256', indexed: false }, { name: 'fee', type: 'uint256', indexed: false }, { name: 'priceE18', type: 'uint256', indexed: false },
  ] },
] as const;

export const erc20Abi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'faucet', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'faucetAmount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'nextClaimAt', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

export const feedAbi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'latestRound', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'latestRoundData', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
  { type: 'function', name: 'getRoundData', stateMutability: 'view', inputs: [{ type: 'uint80' }], outputs: [{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }] },
  { type: 'function', name: 'history', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'int256[]' }, { type: 'uint256[]' }] },
  { type: 'function', name: 'set', stateMutability: 'nonpayable', inputs: [{ type: 'int256' }], outputs: [] },
] as const;
