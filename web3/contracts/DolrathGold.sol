// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * DolrathGold (GOLD)
 * - ERC-20 token minted via user-paid claim transactions.
 * - Claim requires a server signature (EIP-712) to control minting.
 * - Intended flow: the game accrues off-chain GOLD and users claim on-chain when desired.
 * - Burnable: on-chain sinks (marketplace fee) destroy supply via burnFrom.
 */
contract DolrathGold is ERC20, ERC20Burnable, EIP712, Ownable {
    using ECDSA for bytes32;

    struct ClaimRequest {
        address to;
        uint256 amount;
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 private constant CLAIM_REQUEST_TYPEHASH =
        keccak256("ClaimRequest(address to,uint256 amount,uint256 nonce,uint256 deadline)");

    address public signer;

    // Nonce is unique per recipient.
    mapping(address => mapping(uint256 => bool)) public usedNonce;

    error Expired();
    error InvalidSignature();
    error OnlyRecipient();
    error NonceUsed();

    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event Claimed(address indexed to, uint256 amount, uint256 nonce);

    constructor(address signer_) ERC20("Dolrath Gold", "GOLD") EIP712("DolrathGold", "1") Ownable(msg.sender) {
        require(signer_ != address(0), "signer required");
        signer = signer_;
        emit SignerUpdated(address(0), signer_);
    }

    function setSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "signer required");
        address old = signer;
        signer = newSigner;
        emit SignerUpdated(old, newSigner);
    }

    function claimWithSig(
        address to,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external {
        if (block.timestamp > deadline) revert Expired();
        if (msg.sender != to) revert OnlyRecipient();
        if (usedNonce[to][nonce]) revert NonceUsed();

        bytes32 structHash = keccak256(abi.encode(CLAIM_REQUEST_TYPEHASH, to, amount, nonce, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = digest.recover(signature);
        if (recovered != signer) revert InvalidSignature();

        usedNonce[to][nonce] = true;
        _mint(to, amount);

        emit Claimed(to, amount, nonce);
    }
}
