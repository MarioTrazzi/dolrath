// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * DolrathCharacterMarket
 * - Simple escrow marketplace for Dolrath character NFTs.
 * - Seller escrows the character NFT into the contract at a fixed DOL price.
 * - Buyer pays DOL via transferFrom and receives the NFT.
 */
contract DolrathCharacterMarket is ERC721Holder, Ownable, ReentrancyGuard {
    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 priceDol; // base units
        bool active;
    }

    IERC20 public immutable dol;
    IERC721 public immutable characters;

    uint256 public nextListingId = 1;

    mapping(uint256 => Listing) public listings;

    uint256[] private activeListingIds;
    mapping(uint256 => uint256) private activeIndex; // listingId -> index+1

    error NotSeller();
    error NotActive();
    error PriceZero();

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 priceDol);
    event ListingCancelled(uint256 indexed listingId, address indexed seller);
    event ListingPurchased(
        uint256 indexed listingId,
        address indexed seller,
        address indexed buyer,
        uint256 tokenId,
        uint256 priceDol
    );

    constructor(address dolToken, address characterNft) Ownable(msg.sender) {
        require(dolToken != address(0), "dol=0");
        require(characterNft != address(0), "nft=0");
        dol = IERC20(dolToken);
        characters = IERC721(characterNft);
    }

    function getActiveListingIds() external view returns (uint256[] memory) {
        return activeListingIds;
    }

    function createListing(uint256 tokenId, uint256 priceDol) external nonReentrant returns (uint256 listingId) {
        if (priceDol == 0) revert PriceZero();

        // Escrow the NFT. Requires prior approval.
        characters.safeTransferFrom(msg.sender, address(this), tokenId);

        listingId = nextListingId;
        nextListingId += 1;

        listings[listingId] = Listing({seller: msg.sender, tokenId: tokenId, priceDol: priceDol, active: true});

        activeIndex[listingId] = activeListingIds.length + 1;
        activeListingIds.push(listingId);

        emit ListingCreated(listingId, msg.sender, tokenId, priceDol);

        return listingId;
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();
        if (l.seller != msg.sender) revert NotSeller();

        l.active = false;
        _removeActive(listingId);

        characters.safeTransferFrom(address(this), msg.sender, l.tokenId);

        emit ListingCancelled(listingId, msg.sender);
    }

    function buy(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();

        l.active = false;
        _removeActive(listingId);

        // Buyer must approve DOL to this contract.
        require(dol.transferFrom(msg.sender, l.seller, l.priceDol), "dol transfer failed");

        characters.safeTransferFrom(address(this), msg.sender, l.tokenId);

        emit ListingPurchased(listingId, l.seller, msg.sender, l.tokenId, l.priceDol);
    }

    function _removeActive(uint256 listingId) internal {
        uint256 idxPlus1 = activeIndex[listingId];
        if (idxPlus1 == 0) return;

        uint256 idx = idxPlus1 - 1;
        uint256 lastId = activeListingIds[activeListingIds.length - 1];

        if (idx != activeListingIds.length - 1) {
            activeListingIds[idx] = lastId;
            activeIndex[lastId] = idx + 1;
        }

        activeListingIds.pop();
        activeIndex[listingId] = 0;
    }
}
