// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./GiftedBroker.sol";

/// @title TestDollar (tUSD)
/// @notice TESTNET-ONLY stand-in for USDG with a public, rate-limited faucet so testers can fund accounts from
///         inside the app. It has no value and no backing. Mainnet deployments use USDG instead.
contract TestDollar is IERC20 {
    string public constant name = "GiFTED Test Dollar";
    string public constant symbol = "tUSD";
    uint8 public constant decimals = 6;
    uint256 public constant faucetAmount = 1_000e6;
    uint256 public constant faucetCooldown = 1 days;

    address public owner;
    uint256 public totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public lastClaim;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor() { owner = msg.sender; }

    /// @notice Claim test dollars once per day.
    function faucet() external {
        require(block.timestamp >= lastClaim[msg.sender] + faucetCooldown, "cooldown");
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
    }
    function nextClaimAt(address who) external view returns (uint256) { return lastClaim[who] == 0 ? 0 : lastClaim[who] + faucetCooldown; }
    /// @notice Owner mints inventory for the testnet venue.
    function mint(address to, uint256 amount) external { require(msg.sender == owner, "owner"); _mint(to, amount); }

    function approve(address spender, uint256 amount) external returns (bool) { allowance[msg.sender][spender] = amount; emit Approval(msg.sender, spender, amount); return true; }
    function transfer(address to, uint256 amount) external override returns (bool) { _move(msg.sender, to, amount); return true; }
    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        _move(from, to, amount); return true;
    }
    function _mint(address to, uint256 amount) private { totalSupply += amount; balanceOf[to] += amount; emit Transfer(address(0), to, amount); }
    function _move(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "funds");
        balanceOf[from] -= amount; balanceOf[to] += amount; emit Transfer(from, to, amount);
    }
}
