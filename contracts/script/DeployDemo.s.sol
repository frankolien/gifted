// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/DemoAssets.sol";

interface VmDemo {
    function envUint(string calldata) external returns (uint256);
    function addr(uint256) external returns (address);
    function startBroadcast(uint256) external;
    function stopBroadcast() external;
}

/// @notice LOCAL ANVIL ONLY. Deploys a demo dollar (USDG look-alike, 6 decimals), the five Stock Tokens that
///         exist on Robinhood Chain testnet as demo tokens with 90 days of price history, a demo venue and the broker.
contract DeployDemo {
    VmDemo constant vm = VmDemo(address(uint160(uint256(keccak256("hevm cheat code")))));
    event log_named_address(string key, address val);

    struct Spec { string name; string symbol; int256 price; }

    function run() external returns (GiftedBroker broker, DemoToken stable, DemoRouter router) {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        Spec[5] memory specs = [
            Spec("Tesla", "TSLA", 37_890e6),
            Spec("Amazon", "AMZN", 25_498e6),
            Spec("Palantir", "PLTR", 18_499e6),
            Spec("Netflix", "NFLX", 7_216e6),
            Spec("AMD", "AMD", 62_377e6)
        ];
        vm.startBroadcast(key);
        stable = new DemoToken("Global Dollar (demo)", "USDG", 6);
        router = new DemoRouter(stable);
        broker = new GiftedBroker(address(stable), 6, address(router), vm.addr(key));
        router.setBroker(address(broker));
        emit log_named_address("DEMO_BROKER", address(broker));
        emit log_named_address("DEMO_STABLE", address(stable));
        for (uint256 i; i < specs.length; ++i) {
            DemoToken stock = new DemoToken(specs[i].name, specs[i].symbol, 18);
            (int256[] memory answers, uint64[] memory times) = _walk(specs[i].price, i);
            ReferenceFeed feed = new ReferenceFeed(string.concat(specs[i].symbol, " / USD"), specs[i].price, address(0));
            for (uint256 c; c < answers.length; c += 150) _seedChunk(feed, answers, times, c);
            router.setFeed(address(stock), feed);
            broker.configureAsset(address(stock), address(feed), 1 hours, true);
            emit log_named_address(string.concat("DEMO_ASSET ", specs[i].symbol), address(stock));
            emit log_named_address(string.concat("DEMO_FEED ", specs[i].symbol), address(feed));
        }
        broker.setSequencerLive(true);
        vm.stopBroadcast();
    }

    function _seedChunk(ReferenceFeed feed, int256[] memory answers, uint64[] memory times, uint256 from) internal {
        uint256 n = answers.length - from < 150 ? answers.length - from : 150;
        int256[] memory a = new int256[](n); uint64[] memory t = new uint64[](n);
        for (uint256 j; j < n; ++j) { a[j] = answers[from + j]; t[j] = times[from + j]; }
        feed.seed(a, t);
    }

    /// @dev Deterministic random walk ending near `target`: ~83 days at 12h, 6 days at 1h, the last day at 10 min.
    function _walk(int256 target, uint256 salt) internal view returns (int256[] memory answers, uint64[] memory times) {
        uint256 n1 = 166; uint256 n2 = 144; uint256 n3 = 143;
        uint256 n = n1 + n2 + n3;
        answers = new int256[](n); times = new uint64[](n);
        uint256 t = block.timestamp - 90 days;
        int256 p = target * (78 + int256(salt % 5) * 4) / 100;
        for (uint256 i; i < n; ++i) {
            int256 drift = (target - p) / int256(n - i + 8);
            int256 vol = i < n1 ? int256(220) : i < n1 + n2 ? int256(70) : int256(22); // basis points
            int256 r = int256(uint256(keccak256(abi.encode(salt, i))) % uint256(2 * vol + 1)) - vol;
            p = p + drift + p * r / 10_000;
            if (p < target / 4) p = target / 4;
            answers[i] = p; times[i] = uint64(t);
            t += i < n1 ? 12 hours : i < n1 + n2 ? 1 hours : 10 minutes;
        }
    }
}
