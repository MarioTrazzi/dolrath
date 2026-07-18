// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * DolrathItems
 * - ERC-721 item instances minted on purchase.
 * - Mint requires a server signature (EIP-712) and is executed by the buyer.
 * - Each minted token stores the amount of GOLD paid (in base units).
 * - Token metadata is served via baseURI + tokenId.
 * - The signer is rotatable by the owner so a leaked server key does not force a redeploy.
 */
contract DolrathItems is ERC721, EIP712, Ownable {
    using ECDSA for bytes32;

    struct MintItemRequest {
        address to;
        bytes32 purchaseId;
        bytes32 itemKey;
        uint256 paidGold;
        string tokenURI;
        uint256 deadline;
    }

    bytes32 private constant MINT_ITEM_REQUEST_TYPEHASH =
        keccak256("MintItemRequest(address to,bytes32 purchaseId,bytes32 itemKey,uint256 paidGold,string tokenURI,uint256 deadline)");

    address public signer;

    uint256 public nextTokenId = 1;

    mapping(bytes32 => bool) public usedPurchaseId;
    mapping(uint256 => uint256) public paidGoldByTokenId;
    mapping(uint256 => bytes32) public itemKeyByTokenId;
    mapping(uint256 => string) private tokenUriByTokenId;

    string private baseTokenURI;

    error Expired();
    error InvalidSignature();
    error AlreadyMinted();
    error OnlyRecipient();

    event BaseURIUpdated(string oldBaseURI, string newBaseURI);
    event SignerUpdated(address indexed oldSigner, address indexed newSigner);
    event ItemMinted(address indexed to, uint256 indexed tokenId, bytes32 indexed purchaseId, bytes32 itemKey, uint256 paidGold);

    constructor(address signer_, string memory baseURI_) ERC721("Dolrath Items", "DOLITEM") EIP712("DolrathItems", "1") Ownable(msg.sender) {
        require(signer_ != address(0), "signer required");
        signer = signer_;
        baseTokenURI = baseURI_;
        emit SignerUpdated(address(0), signer_);
        emit BaseURIUpdated("", baseURI_);
    }

    function setSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "signer required");
        address old = signer;
        signer = newSigner;
        emit SignerUpdated(old, newSigner);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        string memory old = baseTokenURI;
        baseTokenURI = newBaseURI;
        emit BaseURIUpdated(old, newBaseURI);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseTokenURI;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        string memory stored = tokenUriByTokenId[tokenId];
        if (bytes(stored).length != 0) return stored;

        string memory base = _baseURI();
        if (bytes(base).length == 0) return "";
        return string(abi.encodePacked(base, Strings.toString(tokenId)));
    }

    function mintWithSig(
        address to,
        bytes32 purchaseId,
        bytes32 itemKey,
        uint256 paidGold,
        string calldata tokenURI_,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 tokenId) {
        if (block.timestamp > deadline) revert Expired();
        if (msg.sender != to) revert OnlyRecipient();
        if (usedPurchaseId[purchaseId]) revert AlreadyMinted();

        bytes32 structHash = keccak256(
            abi.encode(
                MINT_ITEM_REQUEST_TYPEHASH,
                to,
                purchaseId,
                itemKey,
                paidGold,
                keccak256(bytes(tokenURI_)),
                deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = digest.recover(signature);
        if (recovered != signer) revert InvalidSignature();

        usedPurchaseId[purchaseId] = true;

        tokenId = nextTokenId;
        nextTokenId += 1;

        paidGoldByTokenId[tokenId] = paidGold;
        itemKeyByTokenId[tokenId] = itemKey;
        tokenUriByTokenId[tokenId] = tokenURI_;

        _safeMint(to, tokenId);

        emit ItemMinted(to, tokenId, purchaseId, itemKey, paidGold);

        return tokenId;
    }
}
