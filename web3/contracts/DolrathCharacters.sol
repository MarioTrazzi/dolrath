// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * DolrathCharacters
 * - ERC-721 where each token represents one game character.
 * - Mint is user-paid, but requires a server signature to prevent arbitrary mints.
 * - tokenURI can point to a dynamic API endpoint (metadata can evolve over time).
 */
contract DolrathCharacters is ERC721URIStorage, EIP712 {
    using ECDSA for bytes32;

    struct MintRequest {
        address to;
        string tokenURI;
        uint256 deadline;
    }

    bytes32 private constant MINT_REQUEST_TYPEHASH =
        keccak256("MintRequest(address to,string tokenURI,uint256 deadline)");

    address public immutable signer;

    uint256 public nextTokenId = 1;

    mapping(bytes32 => bool) public usedTokenUriHash;

    error Expired();
    error InvalidSignature();
    error AlreadyMinted();
    error OnlyRecipient();

    constructor(address signer_) ERC721("Dolrath Characters", "DOLCHAR") EIP712("DolrathCharacters", "1") {
        require(signer_ != address(0), "signer required");
        signer = signer_;
    }

    function mintWithSig(
        address to,
        string calldata tokenURI,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 tokenId) {
        if (block.timestamp > deadline) revert Expired();
        if (msg.sender != to) revert OnlyRecipient();

        bytes32 uriHash = keccak256(bytes(tokenURI));
        if (usedTokenUriHash[uriHash]) revert AlreadyMinted();

        bytes32 structHash = keccak256(
            abi.encode(MINT_REQUEST_TYPEHASH, to, keccak256(bytes(tokenURI)), deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = digest.recover(signature);
        if (recovered != signer) revert InvalidSignature();

        usedTokenUriHash[uriHash] = true;

        tokenId = nextTokenId;
        nextTokenId += 1;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);

        return tokenId;
    }
}
