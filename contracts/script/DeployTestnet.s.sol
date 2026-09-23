// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/DemoAssets.sol";
import "../src/InventoryRouter.sol";
import "../src/TestDollar.sol";

interface VmTestnet {
    function envUint(string calldata) external returns (uint256);
    function envOr(string calldata, address) external returns (address);
    function envOr(string calldata, bool) external returns (bool);
    function addr(uint256) external returns (address);
    function startBroadcast(uint256) external;
    function stopBroadcast() external;
}

/// @notice Robinhood Chain TESTNET (46630) deployment against the real testnet Stock Tokens, settled in USDG
///         or, with USE_TEST_DOLLAR=true, in a faucet-enabled test dollar.
/// @dev Testnet has no Chainlink Stock Token feeds, so this deploys ReferenceFeeds updated only by
///      PRICE_UPDATER (the relayer), and an InventoryRouter that the operator funds with faucet tokens.
///      Addresses verified on 2026-09-23 via the public RPC; re-check before use.
///      Env: DEPLOYER_PRIVATE_KEY, optional PRICE_UPDATER, KEEPER, TREASURY (default: deployer).
contract DeployTestnet {
    VmTestnet constant vm = VmTestnet(address(uint160(uint256(keccak256("hevm cheat code")))));
    event log_named_address(string key, address val);

    address constant USDG = 0x7E955252E15c84f5768B83c41a71F9eba181802F;
    struct Spec { string symbol; address token; int256 price; }

    function run() external returns (GiftedBroker broker, InventoryRouter router) {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(key);
        address updater = vm.envOr("PRICE_UPDATER", deployer);
        address keeper = vm.envOr("KEEPER", deployer);
        address treasury = vm.envOr("TREASURY", deployer);
        Spec[5] memory specs = [
            Spec("TSLA", 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E, 37_890e6),
            Spec("AMZN", 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02, 25_498e6),
            Spec("PLTR", 0x1FBE1a0e43594b3455993B5dE5Fd0A7A266298d0, 18_499e6),
            Spec("NFLX", 0x3b8262A63d25f0477c4DDE23F83cfe22Cb768C93, 7_216e6),
            Spec("AMD", 0x71178BAc73cBeb415514eB542a8995b82669778d, 62_377e6)
        ];
        bool testDollar = vm.envOr("USE_TEST_DOLLAR", false);
        vm.startBroadcast(key);
        address stable = USDG;
        if (testDollar) {
            TestDollar t = new TestDollar();
            stable = address(t);
            emit log_named_address("STABLE", stable);
        }
        router = new InventoryRouter(IERC20(stable), 6, 10);
        if (testDollar) TestDollar(stable).mint(address(router), 250_000e6); // pays out users who sell
        broker = new GiftedBroker(stable, 6, address(router), treasury);
        router.setBroker(address(broker));
        for (uint256 i; i < specs.length; ++i) {
            ReferenceFeed feed = new ReferenceFeed(string.concat(specs[i].symbol, " / USD"), specs[i].price, updater);
            router.setFeed(specs[i].token, feed);
            broker.configureAsset(specs[i].token, address(feed), 1 hours, true);
            emit log_named_address(string.concat("FEED ", specs[i].symbol), address(feed));
        }
        if (keeper != deployer) broker.setKeeper(keeper);
        broker.setFee(25); // 0.25% execution fee to the treasury
        broker.setSequencerLive(true);
        vm.stopBroadcast();
        emit log_named_address("BROKER", address(broker));
        emit log_named_address("ROUTER", address(router));
    }
}
