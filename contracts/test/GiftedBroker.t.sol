// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/DemoAssets.sol";
import "../src/TestDollar.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes calldata) external;
    function assume(bool) external;
}

abstract contract Base {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    function eq(uint256 a, uint256 b, string memory m) internal pure { require(a == b, m); }
    function bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) { return lo + x % (hi - lo + 1); }
}

/// @dev Router that under-delivers, to prove slippage bounds hold even against a bad venue.
contract StingyRouter is IRouter {
    DemoToken stock;
    constructor(DemoToken s) { stock = s; }
    function buy(address, uint256, uint256, address r) external returns (uint256) { stock.mint(r, 1); return 1; }
    function sell(address, uint256, uint256, address) external pure returns (uint256) { return 0; }
}

contract GiftedBrokerTest is Base {
    address constant alice = address(0xA11CE);
    address constant bob = address(0xB0B);
    address constant treasury = address(0x7EA5);
    DemoToken stable; DemoToken stock; ReferenceFeed feed; DemoRouter router; GiftedBroker broker;

    function setUp() public {
        vm.warp(1_700_000_000);
        stable = new DemoToken("USD", "USDG", 6);
        stock = new DemoToken("Tesla", "TSLA", 18);
        feed = new ReferenceFeed("TSLA / USD", 100e8, address(0));
        router = new DemoRouter(stable);
        router.setFeed(address(stock), feed);
        broker = new GiftedBroker(address(stable), 6, address(router), treasury);
        router.setBroker(address(broker));
        broker.configureAsset(address(stock), address(feed), 1 hours, true);
        broker.setSequencerLive(true);
        for (uint256 i; i < 2; ++i) {
            address u = i == 0 ? alice : bob;
            stable.mint(u, 10_000e6);
            vm.startPrank(u); stable.approve(address(broker), type(uint256).max); broker.deposit(1_000e6); vm.stopPrank();
        }
    }

    function solvent() internal view {
        require(stable.balanceOf(address(broker)) >= broker.totalLiabilities(), "insolvent");
    }

    // ---------------------------------------------------------------- instant trades
    function testBuyNowAndSellNow() public {
        vm.prank(alice); uint256 got = broker.buyNow(address(stock), 250e6, 100);
        eq(got, 2.5e18, "bought");
        eq(stock.balanceOf(alice), 2.5e18, "stock");
        eq(broker.balances(alice), 750e6, "balance after buy");
        feed.set(120e8);
        vm.startPrank(alice); stock.approve(address(broker), 1e18); uint256 proceeds = broker.sellNow(address(stock), 1e18, 100); vm.stopPrank();
        eq(proceeds, 120e6, "proceeds");
        eq(broker.balances(alice), 870e6, "credited");
        solvent();
    }

    function testFeesGoToTreasuryAndAreCapped() public {
        vm.expectRevert(bytes("fee")); broker.setFee(101);
        broker.setFee(100);
        vm.prank(alice); broker.buyNow(address(stock), 100e6, 100);
        eq(stable.balanceOf(treasury), 1e6, "buy fee");
        eq(stock.balanceOf(alice), 0.99e18, "net of fee");
        solvent();
    }

    function testUnknownOrDisabledAssetRejected() public {
        vm.prank(alice); vm.expectRevert(bytes("oracle paused")); broker.buyNow(address(0xdead), 1e6, 100);
        broker.configureAsset(address(stock), address(feed), 1 hours, false);
        vm.prank(alice); vm.expectRevert(bytes("plan")); broker.createPlan(address(stock), 1e6, 1 days, 0, 1e20, 100);
    }

    function testRouterOnlyAcceptsBroker() public {
        vm.expectRevert(bytes("broker")); router.buy(address(stock), 1e6, 0, alice);
    }

    function testFeedUpdaterRestricted() public {
        ReferenceFeed f = new ReferenceFeed("X / USD", 1e8, alice);
        vm.expectRevert(bytes("updater")); f.set(2e8);
        vm.prank(alice); f.set(2e8);
        (, int256 a,,,) = f.latestRoundData(); require(a == 2e8, "updated");
    }

    function testConfigureRejectsNon18DecimalAsset() public {
        vm.expectRevert(bytes("asset decimals")); broker.configureAsset(address(stable), address(feed), 1 hours, true);
    }

    // ---------------------------------------------------------------- recurring
    function testPlanRunsImmediatelyThenOnSchedule() public {
        vm.prank(alice); uint256 id = broker.createPlan(address(stock), 100e6, 1 days, 0, 110e18, 100);
        require(broker.planReady(id), "due now");
        broker.executePlan(id);
        eq(stock.balanceOf(alice), 1e18, "first run");
        require(!broker.planReady(id), "not due");
        vm.expectRevert(bytes("not due")); broker.executePlan(id);
        vm.warp(block.timestamp + 1 days); feed.set(100e8);
        broker.executePlan(id);
        eq(stock.balanceOf(alice), 2e18, "second run");
        (,,,,,,, uint32 runs,,) = broker.plans(id);
        eq(runs, 2, "runs");
        solvent();
    }

    function testPlanSkipsAbovePriceCapAndCancel() public {
        vm.prank(alice); uint256 id = broker.createPlan(address(stock), 100e6, 1 days, 0, 90e18, 100);
        require(!broker.planReady(id), "above cap");
        vm.expectRevert(bytes("price")); broker.executePlan(id);
        vm.prank(bob); vm.expectRevert(bytes("user")); broker.cancelPlan(id);
        vm.prank(alice); broker.cancelPlan(id);
        vm.expectRevert(bytes("not due")); broker.executePlan(id);
    }

    function testPauseResumeDoesNotBackfill() public {
        vm.prank(alice); uint256 id = broker.createPlan(address(stock), 10e6, 1 days, 0, 1e21, 100);
        vm.prank(alice); broker.setPlanPaused(id, true);
        require(!broker.planReady(id), "paused");
        vm.warp(block.timestamp + 10 days); feed.set(100e8);
        vm.prank(alice); broker.setPlanPaused(id, false);
        broker.executePlan(id);
        eq(stock.balanceOf(alice), 0.1e18, "one run, not ten");
        vm.prank(alice); broker.cancelPlan(id);
        vm.prank(alice); vm.expectRevert(bytes("user")); broker.setPlanPaused(id, false);
    }

    function testPlanStartInFuture() public {
        vm.prank(alice); uint256 id = broker.createPlan(address(stock), 10e6, 1 hours, uint64(block.timestamp + 3 hours), 1e21, 100);
        require(!broker.planReady(id), "future");
        vm.warp(block.timestamp + 3 hours); feed.set(100e8);
        require(broker.planReady(id), "ready");
    }

    function testStrangersCannotExecuteButOwnersCan() public {
        vm.prank(alice); uint256 id = broker.createPlan(address(stock), 10e6, 1 hours, 0, 1e21, 100);
        vm.prank(bob); vm.expectRevert(bytes("keeper")); broker.executePlan(id);
        vm.prank(alice); broker.executePlan(id);
        eq(stock.balanceOf(alice), 0.1e18, "owner ran own plan");
        vm.prank(alice); uint256 oid = broker.createOrder(address(stock), 10e6, 90e18, uint64(block.timestamp + 1 days), 100);
        vm.prank(alice); vm.expectRevert(bytes("price")); broker.fillOrder(oid);
        feed.set(85e8);
        vm.prank(bob); vm.expectRevert(bytes("keeper")); broker.fillOrder(oid);
        vm.prank(alice); broker.fillOrder(oid);
        solvent();
    }

    // ---------------------------------------------------------------- limit orders
    function testLimitOrderFillAndCancelStatuses() public {
        vm.prank(alice); uint256 id = broker.createOrder(address(stock), 100e6, 90e18, uint64(block.timestamp + 1 days), 100);
        eq(broker.balances(alice), 900e6, "reserved");
        require(!broker.orderReady(id), "not yet");
        feed.set(80e8);
        require(broker.orderReady(id), "ready");
        broker.fillOrder(id);
        eq(stock.balanceOf(alice), 1.25e18, "filled at 80");
        vm.expectRevert(bytes("inactive")); broker.fillOrder(id);
        vm.prank(alice); uint256 id2 = broker.createOrder(address(stock), 50e6, 70e18, uint64(block.timestamp + 1 days), 100);
        vm.prank(alice); broker.cancelOrder(id2);
        eq(broker.balances(alice), 900e6, "refunded");
        (, GiftedBroker.Order[] memory os) = broker.ordersOf(alice);
        require(os[0].status == GiftedBroker.OrderStatus.Filled && os[1].status == GiftedBroker.OrderStatus.Cancelled, "statuses");
        solvent();
    }

    function testExpiredOrderCannotFillButCanBeRefunded() public {
        vm.prank(alice); uint256 id = broker.createOrder(address(stock), 100e6, 200e18, uint64(block.timestamp + 1 hours), 100);
        vm.warp(block.timestamp + 2 hours); feed.set(100e8);
        vm.expectRevert(bytes("inactive")); broker.fillOrder(id);
        vm.prank(alice); broker.cancelOrder(id);
        eq(broker.balances(alice), 1_000e6, "refund after expiry");
    }

    // ---------------------------------------------------------------- oracle & safety
    function testRejectStalePausedAndOffline() public {
        vm.prank(alice); uint256 id = broker.createOrder(address(stock), 100e6, 110e18, uint64(block.timestamp + 1 days), 100);
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert(bytes("stale")); broker.fillOrder(id);
        (,, bool ok) = broker.priceOf(address(stock)); require(!ok, "stale not ok");
        stock.setOraclePaused(true);
        vm.expectRevert(bytes("oracle paused")); broker.fillOrder(id);
        stock.setOraclePaused(false);
        broker.setSequencerLive(false);
        vm.expectRevert(bytes("offline")); broker.fillOrder(id);
        vm.prank(alice); vm.expectRevert(bytes("offline")); broker.buyNow(address(stock), 1e6, 100);
        broker.setSequencerLive(true); broker.setPaused(true);
        vm.expectRevert(bytes("offline")); broker.fillOrder(id);
        // Users can always exit while paused.
        vm.prank(alice); broker.cancelOrder(id);
        vm.prank(alice); broker.withdraw(1_000e6);
        eq(stable.balanceOf(alice), 10_000e6, "exit while paused");
    }

    function testBadVenueCannotUnderDeliver() public {
        broker.setRouter(address(new StingyRouter(stock)));
        vm.prank(alice); vm.expectRevert(bytes("slippage")); broker.buyNow(address(stock), 100e6, 100);
        eq(broker.balances(alice), 1_000e6, "balance intact");
    }

    function testOwnershipTwoStep() public {
        broker.transferOwnership(bob);
        vm.prank(alice); vm.expectRevert(bytes("pending")); broker.acceptOwnership();
        vm.prank(bob); broker.acceptOwnership();
        require(broker.owner() == bob, "owner");
        vm.expectRevert(bytes("owner")); broker.setFee(1);
    }

    function testWithdrawMoreThanBalanceFails() public {
        vm.prank(alice); vm.expectRevert(bytes("balance")); broker.withdraw(1_000e6 + 1);
    }

    // ---------------------------------------------------------------- fuzz
    function testFuzzBuyOutputMatchesPrice(uint256 amount, uint256 price) public {
        amount = bound(amount, 1e4, 1_000e6);
        price = bound(price, 1e8, 5_000e8);
        feed.set(int256(price));
        vm.prank(alice); uint256 got = broker.buyNow(address(stock), amount, 0);
        eq(got, amount * 1e12 * 1e18 / (price * 1e10), "exact at oracle price");
        solvent();
    }

    function testFuzzOrderNeverFillsAboveLimit(uint256 limit, uint256 price) public {
        limit = bound(limit, 1e18, 1_000e18);
        price = bound(price, 1e8, 1_000e8);
        feed.set(int256(price));
        vm.prank(alice); uint256 id = broker.createOrder(address(stock), 10e6, limit, uint64(block.timestamp + 1 days), 100);
        if (price * 1e10 > limit) { vm.expectRevert(bytes("price")); broker.fillOrder(id); }
        else { broker.fillOrder(id); }
        solvent();
    }

    function testFuzzDepositWithdrawRoundTrip(uint256 amount) public {
        amount = bound(amount, 1, 9_000e6);
        vm.startPrank(alice); broker.deposit(amount); broker.withdraw(amount); vm.stopPrank();
        eq(broker.balances(alice), 1_000e6, "unchanged");
        solvent();
    }
}

contract TestDollarTest is Base {
    function testFaucetOncePerDay() public {
        vm.warp(1_700_000_000);
        TestDollar t = new TestDollar();
        vm.prank(address(0xA11CE)); t.faucet();
        eq(t.balanceOf(address(0xA11CE)), 1_000e6, "claimed");
        vm.prank(address(0xA11CE)); vm.expectRevert(bytes("cooldown")); t.faucet();
        vm.warp(block.timestamp + 1 days);
        vm.prank(address(0xA11CE)); t.faucet();
        eq(t.balanceOf(address(0xA11CE)), 2_000e6, "claimed again");
        vm.prank(address(0xA11CE)); vm.expectRevert(bytes("owner")); t.mint(address(0xA11CE), 1);
    }
}

/// @dev Random sequences of user and keeper actions for invariant testing.
contract Handler is Base {
    GiftedBroker public broker; DemoToken public stable; DemoToken public stock; ReferenceFeed public feed;
    address[3] users = [address(0x1001), address(0x1002), address(0x1003)];

    constructor(GiftedBroker b, DemoToken s, DemoToken k, ReferenceFeed f) {
        broker = b; stable = s; stock = k; feed = f;
        for (uint256 i; i < 3; ++i) { stable.mint(users[i], 1e15); vm.prank(users[i]); stable.approve(address(b), type(uint256).max); vm.prank(users[i]); stock.approve(address(b), type(uint256).max); }
    }
    function _u(uint256 s) internal view returns (address) { return users[s % 3]; }

    function deposit(uint256 s, uint256 a) external { a = bound(a, 1, 1e10); vm.prank(_u(s)); broker.deposit(a); }
    function withdraw(uint256 s, uint256 a) external { address u = _u(s); uint256 b = broker.balances(u); if (b == 0) return; vm.prank(u); broker.withdraw(bound(a, 1, b)); }
    function buy(uint256 s, uint256 a) external { address u = _u(s); uint256 b = broker.balances(u); if (b < 1e4) return; vm.prank(u); broker.buyNow(address(stock), bound(a, 1e4, b), 100); }
    function sell(uint256 s, uint256 a) external { address u = _u(s); uint256 b = stock.balanceOf(u); if (b < 1e12) return; vm.prank(u); broker.sellNow(address(stock), bound(a, 1e12, b), 100); }
    function order(uint256 s, uint256 a, uint256 limit) external {
        address u = _u(s); uint256 b = broker.balances(u); if (b < 1e4) return;
        vm.prank(u); broker.createOrder(address(stock), bound(a, 1e4, b), bound(limit, 1e18, 300e18), uint64(block.timestamp + 1 days), 100);
    }
    function cancel(uint256 id) external {
        uint256 n = broker.ordersLength(); if (n == 0) return; id %= n;
        (address u,,,,,,, GiftedBroker.OrderStatus st) = broker.orders(id);
        if (st != GiftedBroker.OrderStatus.Open) return;
        vm.prank(u); broker.cancelOrder(id);
    }
    function fill(uint256 id) external { uint256 n = broker.ordersLength(); if (n == 0) return; id %= n; if (broker.orderReady(id)) broker.fillOrder(id); }
    function move(uint256 p) external { feed.set(int256(bound(p, 50e8, 250e8))); }
}

contract GiftedBrokerInvariantTest is Base {
    GiftedBroker broker; DemoToken stable; Handler handler;

    function setUp() public {
        vm.warp(1_700_000_000);
        stable = new DemoToken("USD", "USDG", 6);
        DemoToken stock = new DemoToken("Tesla", "TSLA", 18);
        ReferenceFeed feed = new ReferenceFeed("TSLA / USD", 100e8, address(0));
        DemoRouter router = new DemoRouter(stable);
        router.setFeed(address(stock), feed);
        broker = new GiftedBroker(address(stable), 6, address(router), address(0x7EA5));
        router.setBroker(address(broker));
        broker.configureAsset(address(stock), address(feed), 365 days, true);
        broker.setSequencerLive(true);
        broker.setFee(50);
        handler = new Handler(broker, stable, stock, feed);
        broker.setKeeper(address(handler));
    }

    function targetContracts() public view returns (address[] memory t) { t = new address[](1); t[0] = address(handler); }

    /// Every user claim is fully backed by stablecoin held by the broker.
    function invariant_solvent() public view {
        require(stable.balanceOf(address(broker)) >= broker.totalLiabilities(), "insolvent");
    }

    /// Liabilities equal the sum of balances plus open order escrow.
    function invariant_liabilitiesAccounted() public view {
        uint256 sum = broker.balances(address(0x1001)) + broker.balances(address(0x1002)) + broker.balances(address(0x1003));
        uint256 n = broker.ordersLength();
        for (uint256 i; i < n; ++i) {
            (,, uint256 amount,,,,, GiftedBroker.OrderStatus st) = broker.orders(i);
            if (st == GiftedBroker.OrderStatus.Open) sum += amount;
        }
        require(sum == broker.totalLiabilities(), "accounting");
    }
}
