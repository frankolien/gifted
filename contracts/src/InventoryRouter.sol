// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GiftedBroker.sol";

/// @title InventoryRouter
/// @notice TESTNET venue that fills broker trades from an inventory of real testnet Stock Tokens and USDG
///         at the reference feed price plus a fixed spread. It is a transparent stand-in for a market maker
///         (the role Rialto or an RFQ maker plays on mainnet) because testnet AMM depth is unreliable.
/// @dev Only the broker can trade. The owner funds and withdraws inventory. Output is bounded by the
///      broker's own oracle-derived minimums, so a mispriced inventory cannot under-deliver to users.
contract InventoryRouter is IRouter {
    IERC20 public immutable stable;
    uint256 private immutable stableScale;
    address public owner;
    address public broker;
    uint256 public spreadBps;
    mapping(address => IPriceFeed) public feedOf;

    event Filled(address indexed asset, bool isBuy, uint256 amountIn, uint256 amountOut);

    constructor(IERC20 stable_, uint8 stableDecimals_, uint256 spreadBps_) {
        require(spreadBps_ <= 100, "spread");
        stable = stable_; stableScale = 10 ** (18 - stableDecimals_); owner = msg.sender; spreadBps = spreadBps_;
    }
    modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }
    modifier onlyBroker() { require(msg.sender == broker, "broker"); _; }

    function setBroker(address b) external onlyOwner { broker = b; }
    function setFeed(address asset, IPriceFeed feed) external onlyOwner { feedOf[asset] = feed; }
    function setSpread(uint256 bps) external onlyOwner { require(bps <= 100, "spread"); spreadBps = bps; }
    function withdraw(IERC20 token, uint256 amount) external onlyOwner { require(token.transfer(owner, amount), "transfer"); }

    function _priceE18(address asset) internal view returns (uint256) {
        IPriceFeed f = feedOf[asset];
        require(address(f) != address(0), "asset");
        (, int256 answer,,,) = f.latestRoundData();
        require(answer > 0, "price");
        return uint256(answer) * 10 ** (18 - f.decimals());
    }

    function buy(address asset, uint256 stableIn, uint256 minAssetOut, address recipient) external onlyBroker returns (uint256 assetOut) {
        uint256 ask = _priceE18(asset) * (10_000 + spreadBps) / 10_000;
        assetOut = stableIn * stableScale * 1e18 / ask;
        require(assetOut >= minAssetOut, "slippage");
        require(IERC20(asset).transfer(recipient, assetOut), "inventory");
        emit Filled(asset, true, stableIn, assetOut);
    }

    function sell(address asset, uint256 assetIn, uint256 minStableOut, address recipient) external onlyBroker returns (uint256 stableOut) {
        uint256 bid = _priceE18(asset) * (10_000 - spreadBps) / 10_000;
        stableOut = assetIn * bid / 1e18 / stableScale;
        require(stableOut >= minStableOut, "slippage");
        require(stable.transfer(recipient, stableOut), "inventory");
        emit Filled(asset, false, assetIn, stableOut);
    }
}
