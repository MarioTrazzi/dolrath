// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * DolToken (DOL) — v2
 * - Fixed supply: 1,000,000,000 DOL minted once at deploy to the treasury.
 * - No mint function and no minter role: the supply can only shrink (burns).
 * - Allocation buckets (Play & Achieve, team, investors, liquidity...) are
 *   distributed from the treasury per the vesting schedule in the whitepaper.
 */
contract DolToken is ERC20, ERC20Burnable {
    uint256 public constant MAX_SUPPLY = 1_000_000_000 ether;

    constructor(address treasury) ERC20("Dolrath", "DOL") {
        require(treasury != address(0), "treasury=0");
        _mint(treasury, MAX_SUPPLY);
    }
}
