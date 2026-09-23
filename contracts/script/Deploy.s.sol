// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/GiftedBroker.sol";

interface VmDeploy {
    function envAddress(string calldata) external returns (address);
    function envUint(string calldata) external returns (uint256);
    function startBroadcast(uint256) external;
    function stopBroadcast() external;
}

contract Deploy {
    VmDeploy constant vm = VmDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (GiftedBroker broker) {
        address stable = vm.envAddress("STABLE_ADDRESS");
        uint8 stableDecimals = uint8(vm.envUint("STABLE_DECIMALS"));
        address router = vm.envAddress("ROUTER_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(key);
        broker = new GiftedBroker(stable, stableDecimals, router, treasury);
        vm.stopBroadcast();
    }
}
