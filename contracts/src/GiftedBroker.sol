// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

/// @notice Chainlink AggregatorV3 subset.
interface IPriceFeed {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice Execution venue adapter. Must deliver at least the minimum output to `recipient` or revert.
interface IRouter {
    function buy(address asset, uint256 stableIn, uint256 minAssetOut, address recipient)
        external returns (uint256 assetOut);
    function sell(address asset, uint256 assetIn, uint256 minStableOut, address recipient)
        external returns (uint256 stableOut);
}

/// @title GiftedBroker
/// @notice Stablecoin-funded Stock Token investing: instant buys and sells, recurring buys and
///         resting limit buys. Every execution is bounded by a fresh, unpaused oracle price.
/// @dev Testnet prototype. Stock Tokens are assumed to use 18 decimals (checked on configuration).
contract GiftedBroker {
    // ---------------------------------------------------------------- constants & config
    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_FEE_BPS = 100; // 1%
    uint16 public constant MAX_SLIPPAGE_BPS = 1_000; // 10%
    uint64 public constant MIN_INTERVAL = 1 hours;

    IERC20 public immutable stable;
    uint8 public immutable stableDecimals;
    uint256 private immutable stableScale; // 10 ** (18 - stableDecimals)

    address public owner;
    address public pendingOwner;
    address public keeper;
    address public treasury;
    IRouter public router;
    uint256 public feeBps;
    bool public paused;
    /// @dev No canonical L2 sequencer uptime feed exists for Robinhood Chain yet. The operator sets this
    ///      from an independent monitor; it defaults to false so execution fails closed.
    bool public sequencerLive;
    uint256 private entered;

    struct AssetConfig { IPriceFeed feed; uint32 maxAge; bool enabled; }
    mapping(address => AssetConfig) public assets;
    address[] private assetList;

    /// @notice Unreserved stablecoin each user can spend or withdraw.
    mapping(address => uint256) public balances;
    /// @notice Sum of all user claims (balances plus open order escrow). Never exceeds stable held.
    uint256 public totalLiabilities;

    struct Plan {
        address user;
        bool ended;
        address asset;
        uint256 amount;
        uint256 maxPriceE18;
        uint64 interval;
        uint64 nextAt;
        uint32 runs;
        uint16 maxSlippageBps;
        bool active;
    }
    Plan[] public plans;

    enum OrderStatus { None, Open, Filled, Cancelled }
    struct Order {
        address user;
        address asset;
        uint256 amount;
        uint256 limitPriceE18;
        uint64 expiry;
        uint64 createdAt;
        uint16 maxSlippageBps;
        OrderStatus status;
    }
    Order[] public orders;

    mapping(address => uint256[]) private planIds;
    mapping(address => uint256[]) private orderIds;

    enum Source { Instant, Plan, Order }

    // ---------------------------------------------------------------- events
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event PlanCreated(uint256 indexed id, address indexed user, address indexed asset, uint256 amount, uint64 interval, uint64 firstAt);
    event PlanCancelled(uint256 indexed id, address indexed user);
    event PlanPaused(uint256 indexed id, address indexed user, bool paused);
    event OrderCreated(uint256 indexed id, address indexed user, address indexed asset, uint256 amount, uint256 limitPriceE18, uint64 expiry);
    event OrderCancelled(uint256 indexed id, address indexed user);
    event Bought(address indexed user, address indexed asset, Source source, uint256 indexed refId,
        uint256 spent, uint256 received, uint256 fee, uint256 priceE18);
    event Sold(address indexed user, address indexed asset, uint256 assetIn, uint256 proceeds, uint256 fee, uint256 priceE18);
    event AssetConfigured(address indexed asset, address feed, uint32 maxAge, bool enabled);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event KeeperSet(address keeper);
    event RouterSet(address router);
    event FeeSet(uint256 feeBps);
    event TreasurySet(address treasury);
    event PausedSet(bool paused);
    event SequencerLiveSet(bool live);

    // ---------------------------------------------------------------- modifiers
    modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }
    modifier nonReentrant() { require(entered == 0, "reentrant"); entered = 1; _; entered = 0; }
    modifier whenLive() { require(!paused && sequencerLive, "offline"); _; }

    constructor(address stable_, uint8 stableDecimals_, address router_, address treasury_) {
        require(stable_ != address(0) && router_ != address(0) && treasury_ != address(0), "zero");
        require(stableDecimals_ <= 18, "decimals");
        stable = IERC20(stable_);
        stableDecimals = stableDecimals_;
        stableScale = 10 ** (18 - stableDecimals_);
        router = IRouter(router_);
        treasury = treasury_;
        owner = msg.sender;
        keeper = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ---------------------------------------------------------------- admin
    function configureAsset(address asset, address feed, uint32 maxAge, bool enabled) external onlyOwner {
        require(asset != address(0) && feed != address(0) && maxAge > 0, "config");
        (bool ok, bytes memory data) = asset.staticcall(abi.encodeWithSignature("decimals()"));
        require(ok && data.length == 32 && abi.decode(data, (uint8)) == 18, "asset decimals");
        if (address(assets[asset].feed) == address(0)) assetList.push(asset);
        assets[asset] = AssetConfig(IPriceFeed(feed), maxAge, enabled);
        emit AssetConfigured(asset, feed, maxAge, enabled);
    }
    function transferOwnership(address next) external onlyOwner { pendingOwner = next; emit OwnershipTransferStarted(owner, next); }
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "pending");
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender; pendingOwner = address(0);
    }
    function setKeeper(address next) external onlyOwner { require(next != address(0), "zero"); keeper = next; emit KeeperSet(next); }
    function setRouter(address next) external onlyOwner { require(next != address(0), "zero"); router = IRouter(next); emit RouterSet(next); }
    function setTreasury(address next) external onlyOwner { require(next != address(0), "zero"); treasury = next; emit TreasurySet(next); }
    function setFee(uint256 next) external onlyOwner { require(next <= MAX_FEE_BPS, "fee"); feeBps = next; emit FeeSet(next); }
    function setPaused(bool next) external onlyOwner { paused = next; emit PausedSet(next); }
    function setSequencerLive(bool next) external onlyOwner { sequencerLive = next; emit SequencerLiveSet(next); }

    // ---------------------------------------------------------------- funding
    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "amount");
        uint256 beforeBalance = stable.balanceOf(address(this));
        _safeTransferFrom(stable, msg.sender, address(this), amount);
        require(stable.balanceOf(address(this)) - beforeBalance == amount, "fee token");
        balances[msg.sender] += amount;
        totalLiabilities += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0 && balances[msg.sender] >= amount, "balance");
        balances[msg.sender] -= amount;
        totalLiabilities -= amount;
        _safeTransfer(stable, msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- instant trades (user-initiated)
    /// @notice Buy a Stock Token now with `amount` of your balance. Output is bounded by the oracle price.
    function buyNow(address asset, uint256 amount, uint16 slippageBps) external whenLive nonReentrant returns (uint256 received) {
        require(amount > 0 && balances[msg.sender] >= amount, "balance");
        require(slippageBps <= MAX_SLIPPAGE_BPS, "bounds");
        uint256 price = _price(asset);
        balances[msg.sender] -= amount;
        totalLiabilities -= amount;
        received = _buy(msg.sender, asset, amount, price, slippageBps, Source.Instant, 0);
    }

    /// @notice Sell `assetIn` Stock Tokens from your wallet. Proceeds (minus fee) are credited to your balance.
    function sellNow(address asset, uint256 assetIn, uint16 slippageBps) external whenLive nonReentrant returns (uint256 proceeds) {
        require(assetIn > 0 && slippageBps <= MAX_SLIPPAGE_BPS, "bounds");
        uint256 price = _price(asset);
        uint256 expectedE18 = assetIn * price / 1e18;
        uint256 minOut = expectedE18 / stableScale * (BPS - slippageBps) / BPS;
        require(minOut > 0, "dust");
        _safeTransferFrom(IERC20(asset), msg.sender, address(router), assetIn);
        uint256 beforeBalance = stable.balanceOf(address(this));
        uint256 reported = router.sell(asset, assetIn, minOut, address(this));
        uint256 out = stable.balanceOf(address(this)) - beforeBalance;
        require(out >= minOut && reported == out, "slippage");
        uint256 fee = out * feeBps / BPS;
        proceeds = out - fee;
        if (fee > 0) _safeTransfer(stable, treasury, fee);
        balances[msg.sender] += proceeds;
        totalLiabilities += proceeds;
        emit Sold(msg.sender, asset, assetIn, proceeds, fee, price);
    }

    // ---------------------------------------------------------------- recurring buys
    /// @param startAt First run time. Zero (or any past time) makes the first buy due immediately.
    function createPlan(address asset, uint256 amount, uint64 interval, uint64 startAt, uint256 maxPriceE18, uint16 slippageBps)
        external returns (uint256 id)
    {
        require(assets[asset].enabled && amount > 0 && interval >= MIN_INTERVAL, "plan");
        require(maxPriceE18 > 0 && slippageBps <= MAX_SLIPPAGE_BPS, "bounds");
        uint64 firstAt = startAt > block.timestamp ? startAt : uint64(block.timestamp);
        id = plans.length;
        plans.push(Plan(msg.sender, false, asset, amount, maxPriceE18, interval, firstAt, 0, slippageBps, true));
        planIds[msg.sender].push(id);
        emit PlanCreated(id, msg.sender, asset, amount, interval, firstAt);
    }

    /// @notice End a recurring buy permanently.
    function cancelPlan(uint256 id) external {
        Plan storage p = plans[id];
        require(p.user == msg.sender && !p.ended, "user");
        p.active = false;
        p.ended = true;
        emit PlanCancelled(id, msg.sender);
    }

    /// @notice Pause or resume a recurring buy. Resuming never back-fills missed runs.
    function setPlanPaused(uint256 id, bool pause) external {
        Plan storage p = plans[id];
        require(p.user == msg.sender && !p.ended && p.active == pause, "user");
        p.active = !pause;
        if (!pause && p.nextAt < block.timestamp) p.nextAt = uint64(block.timestamp);
        emit PlanPaused(id, msg.sender, pause);
    }

    /// @notice True when the keeper can run this plan right now (used by keepers and the app).
    function planReady(uint256 id) public view returns (bool) {
        Plan storage p = plans[id];
        if (!p.active || block.timestamp < p.nextAt || balances[p.user] < p.amount || paused || !sequencerLive) return false;
        (uint256 price, bool ok) = _tryPrice(p.asset);
        return ok && price <= p.maxPriceE18;
    }

    /// @notice Run a due recurring buy. The keeper normally does this; the plan's owner can also trigger it
    ///         so execution never depends on keeper liveness. All price, timing and slippage bounds still apply.
    function executePlan(uint256 id) external whenLive nonReentrant {
        Plan storage p = plans[id];
        require(msg.sender == keeper || msg.sender == p.user, "keeper");
        require(p.active && block.timestamp >= p.nextAt && balances[p.user] >= p.amount, "not due");
        uint256 price = _price(p.asset);
        require(price <= p.maxPriceE18, "price");
        balances[p.user] -= p.amount;
        totalLiabilities -= p.amount;
        // Schedule from the due time so runs do not drift, but never schedule into the past.
        uint64 next = p.nextAt + p.interval;
        p.nextAt = next > block.timestamp ? next : uint64(block.timestamp) + p.interval;
        p.runs += 1;
        _buy(p.user, p.asset, p.amount, price, p.maxSlippageBps, Source.Plan, id);
    }

    // ---------------------------------------------------------------- limit buys
    /// @notice Limit buy. The amount is reserved immediately; cancellation (even after expiry) returns it.
    function createOrder(address asset, uint256 amount, uint256 limitPriceE18, uint64 expiry, uint16 slippageBps)
        external returns (uint256 id)
    {
        require(assets[asset].enabled && amount > 0 && balances[msg.sender] >= amount, "order");
        require(limitPriceE18 > 0 && expiry > block.timestamp && slippageBps <= MAX_SLIPPAGE_BPS, "bounds");
        balances[msg.sender] -= amount; // stays in totalLiabilities as escrow
        id = orders.length;
        orders.push(Order(msg.sender, asset, amount, limitPriceE18, expiry, uint64(block.timestamp), slippageBps, OrderStatus.Open));
        orderIds[msg.sender].push(id);
        emit OrderCreated(id, msg.sender, asset, amount, limitPriceE18, expiry);
    }

    function cancelOrder(uint256 id) external {
        Order storage o = orders[id];
        require(o.user == msg.sender && o.status == OrderStatus.Open, "order");
        o.status = OrderStatus.Cancelled;
        balances[msg.sender] += o.amount;
        emit OrderCancelled(id, msg.sender);
    }

    function orderReady(uint256 id) public view returns (bool) {
        Order storage o = orders[id];
        if (o.status != OrderStatus.Open || block.timestamp > o.expiry || paused || !sequencerLive) return false;
        (uint256 price, bool ok) = _tryPrice(o.asset);
        return ok && price <= o.limitPriceE18;
    }

    /// @notice Fill a limit buy whose price condition is met. Callable by the keeper or the order's owner.
    function fillOrder(uint256 id) external whenLive nonReentrant {
        Order storage o = orders[id];
        require(msg.sender == keeper || msg.sender == o.user, "keeper");
        require(o.status == OrderStatus.Open && block.timestamp <= o.expiry, "inactive");
        uint256 price = _price(o.asset);
        require(price <= o.limitPriceE18, "price");
        o.status = OrderStatus.Filled;
        totalLiabilities -= o.amount;
        _buy(o.user, o.asset, o.amount, price, o.maxSlippageBps, Source.Order, id);
    }

    // ---------------------------------------------------------------- views for apps and keepers
    function plansLength() external view returns (uint256) { return plans.length; }
    function ordersLength() external view returns (uint256) { return orders.length; }
    function listAssets() external view returns (address[] memory) { return assetList; }
    function planIdsOf(address user) external view returns (uint256[] memory) { return planIds[user]; }
    function orderIdsOf(address user) external view returns (uint256[] memory) { return orderIds[user]; }

    function plansOf(address user) external view returns (uint256[] memory ids, Plan[] memory out) {
        ids = planIds[user];
        out = new Plan[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = plans[ids[i]];
    }
    function ordersOf(address user) external view returns (uint256[] memory ids, Order[] memory out) {
        ids = orderIds[user];
        out = new Order[](ids.length);
        for (uint256 i; i < ids.length; ++i) out[i] = orders[ids[i]];
    }

    /// @notice Non-reverting price read for interfaces. `ok` is false when the price is unusable.
    function priceOf(address asset) external view returns (uint256 priceE18, uint256 updatedAt, bool ok) {
        AssetConfig memory c = assets[asset];
        if (!c.enabled) return (0, 0, false);
        try c.feed.latestRoundData() returns (uint80 roundId, int256 answer, uint256, uint256 at, uint80 answeredInRound) {
            updatedAt = at;
            if (answer <= 0) return (0, at, false);
            uint8 d = c.feed.decimals();
            if (d > 18) return (0, at, false);
            priceE18 = uint256(answer) * 10 ** (18 - d);
            ok = at > 0 && at <= block.timestamp && block.timestamp - at <= c.maxAge
                && answeredInRound >= roundId && !_assetPaused(asset);
        } catch {
            return (0, 0, false);
        }
    }

    // ---------------------------------------------------------------- internals
    function _tryPrice(address asset) internal view returns (uint256, bool) {
        try this.priceOf(asset) returns (uint256 p, uint256, bool ok) { return (p, ok); } catch { return (0, false); }
    }

    /// @dev Robinhood Stock Tokens expose `oraclePaused()` during corporate actions. Some deployments revert
    ///      on this call (observed on testnet), so a failed or malformed call is treated as "not paused".
    function _assetPaused(address asset) internal view returns (bool) {
        (bool ok, bytes memory data) = asset.staticcall(abi.encodeWithSignature("oraclePaused()"));
        return ok && data.length >= 32 && abi.decode(data, (bool));
    }

    function _price(address asset) internal view returns (uint256) {
        AssetConfig memory c = assets[asset];
        require(c.enabled && !_assetPaused(asset), "oracle paused");
        (uint80 roundId, int256 answer,, uint256 updatedAt, uint80 answeredInRound) = c.feed.latestRoundData();
        require(answer > 0 && updatedAt > 0 && updatedAt <= block.timestamp, "oracle answer");
        require(block.timestamp - updatedAt <= c.maxAge && answeredInRound >= roundId, "stale");
        uint8 d = c.feed.decimals();
        require(d <= 18, "feed decimals");
        // Feed answers already include the ERC-8056 UI multiplier; do not apply it again.
        return uint256(answer) * 10 ** (18 - d);
    }

    /// @dev Caller has already removed `amount` from the user's balance and from liabilities.
    function _buy(address user, address asset, uint256 amount, uint256 priceE18, uint16 slippageBps, Source source, uint256 refId)
        internal returns (uint256 received)
    {
        uint256 fee = amount * feeBps / BPS;
        uint256 spend = amount - fee;
        uint256 expected = spend * stableScale * 1e18 / priceE18;
        uint256 minOut = expected * (BPS - slippageBps) / BPS;
        require(minOut > 0, "dust");
        if (fee > 0) _safeTransfer(stable, treasury, fee);
        _safeTransfer(stable, address(router), spend);
        uint256 beforeBalance = IERC20(asset).balanceOf(user);
        uint256 reported = router.buy(asset, spend, minOut, user);
        received = IERC20(asset).balanceOf(user) - beforeBalance;
        require(received >= minOut && reported == received, "slippage");
        emit Bought(user, asset, source, refId, amount, received, fee, priceE18);
    }

    function _safeTransfer(IERC20 token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer");
    }

    function _safeTransferFrom(IERC20 token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transferFrom, (from, to, amount)));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer");
    }
}
