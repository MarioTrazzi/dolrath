// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// Test-only NFT used by the market unit tests.
contract MockERC721 is ERC721 {
    uint256 public nextId = 1;

    constructor() ERC721("Mock", "MOCK") {}

    function mint(address to) external returns (uint256 id) {
        id = nextId;
        nextId += 1;
        _mint(to, id);
    }
}
