// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GiftedBroker.sol";

/// @notice Unrestricted LOCAL-DEMO token. Anyone can mint. Never use as a real stablecoin or Stock Token.
///         Mirrors the Stock Token surface the broker relies on: 18 decimals, `oraclePaused()`, `uiMultiplier()`.
contract DemoToken is IERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    bool public oraclePaused;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) { name = name_; symbol = symbol_; decimals = decimals_; }
    function uiMultiplier() external pure returns (uint256) { return 1e18; }
    function setOraclePaused(bool p) external { oraclePaused = p; }
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; totalSupply += amount; emit Transfer(address(0), to, amount); }
    function burn(uint256 amount) external { balanceOf[msg.sender] -= amount; totalSupply -= amount; emit Transfer(msg.sender, address(0), amount); }
    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; emit Approval(msg.sender, spender, amount); return true; }
    function transfer(address to, uint256 amount) external override returns (bool) { _move(msg.sender, to, amount); return true; }
    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount); return true;
    }
    function _move(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "funds");
        balanceOf[from] -= amount; balanceOf[to] += amount; emit Transfer(from, to, amount);
    }
}

/// @notice Chainlink-compatible reference feed (8 decimals) that keeps full round history.
/// @dev Robinhood Chain testnet has no Chainlink Stock Token feeds, so the testnet deployment publishes
///      its own reference prices through this contract. With `updater == address(0)` anyone may update it
///      (local demo only). On mainnet the broker should point at the official Chainlink feeds instead.
contract ReferenceFeed is IPriceFeed {
    struct Round { int192 answer; uint64 updatedAt; }
    Round[] private rounds; // round id = index + 1
    string public description;
    address public immutable updater;

    event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);

    constructor(string memory description_, int256 initial, address updater_) {
        require(initial > 0, "answer");
        description = description_; updater = updater_;
        rounds.push(Round(int192(initial), uint64(block.timestamp)));
    }
    modifier onlyUpdater() { require(updater == address(0) || msg.sender == updater, "updater"); _; }

    function decimals() external pure returns (uint8) { return 8; }
    function version() external pure returns (uint256) { return 1; }
    function latestRound() external view returns (uint256) { return rounds.length; }
    function latestAnswer() external view returns (int256) { return rounds[rounds.length - 1].answer; }
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) { return getRoundData(uint80(rounds.length)); }
    function getRoundData(uint80 id) public view returns (uint80, int256, uint256, uint256, uint80) {
        require(id > 0 && id <= rounds.length, "round");
        Round memory r = rounds[id - 1];
        return (id, r.answer, r.updatedAt, r.updatedAt, id);
    }
    /// @notice Last `count` rounds, oldest first, for charts.
    function history(uint256 count) external view returns (int256[] memory answers, uint256[] memory times) {
        uint256 n = count > rounds.length ? rounds.length : count;
        answers = new int256[](n); times = new uint256[](n);
        for (uint256 i; i < n; ++i) { Round memory r = rounds[rounds.length - n + i]; answers[i] = r.answer; times[i] = r.updatedAt; }
    }
    function set(int256 next) external onlyUpdater {
        require(next > 0, "answer");
        rounds.push(Round(int192(next), uint64(block.timestamp)));
        emit AnswerUpdated(next, rounds.length, block.timestamp);
    }
    /// @notice Backfill history before the latest round. Timestamps must increase and be in the past.
    function seed(int256[] calldata answers, uint64[] calldata times) external onlyUpdater {
        require(answers.length == times.length, "len");
        Round memory last = rounds[rounds.length - 1];
        uint64 prev = rounds.length > 1 ? rounds[rounds.length - 2].updatedAt : 0;
        rounds.pop();
        for (uint256 i; i < answers.length; ++i) {
            require(answers[i] > 0 && times[i] > prev && times[i] < block.timestamp, "seed");
            prev = times[i];
            rounds.push(Round(int192(answers[i]), times[i]));
        }
        rounds.push(Round(last.answer, uint64(block.timestamp)));
    }
}

/// @notice LOCAL-DEMO venue: fills at the reference price by minting and burning demo tokens.
///         No external liquidity. Only the broker may call it.
contract DemoRouter is IRouter {
    DemoToken public immutable stable;
    uint256 private immutable stableScale;
    address public broker;
    address public immutable admin;
    mapping(address => IPriceFeed) public feedOf;

    constructor(DemoToken stable_) { stable = stable_; stableScale = 10 ** (18 - stable_.decimals()); admin = msg.sender; }
    function setBroker(address b) external { require(msg.sender == admin && broker == address(0), "admin"); broker = b; }
    function setFeed(address asset, IPriceFeed feed) external { require(msg.sender == admin, "admin"); feedOf[asset] = feed; }
    modifier onlyBroker() { require(msg.sender == broker, "broker"); _; }

    function _priceE18(address asset) internal view returns (uint256) {
        IPriceFeed f = feedOf[asset];
        require(address(f) != address(0), "asset");
        (, int256 answer,,,) = f.latestRoundData();
        return uint256(answer) * 1e10;
    }
    function buy(address asset, uint256 stableIn, uint256 minAssetOut, address recipient) external onlyBroker returns (uint256 assetOut) {
        assetOut = stableIn * stableScale * 1e18 / _priceE18(asset);
        require(assetOut >= minAssetOut, "slippage");
        DemoToken(asset).mint(recipient, assetOut);
    }
    function sell(address asset, uint256 assetIn, uint256 minStableOut, address recipient) external onlyBroker returns (uint256 stableOut) {
        stableOut = assetIn * _priceE18(asset) / 1e18 / stableScale;
        require(stableOut >= minStableOut, "slippage");
        DemoToken(asset).burn(assetIn);
        stable.mint(recipient, stableOut);
    }
}
