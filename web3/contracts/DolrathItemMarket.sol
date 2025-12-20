// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * DolrathItemMarket
 * - Simple escrow marketplace for Dolrath item NFTs.
 * - Seller escrows the item NFT into the contract at a fixed GOLD price.
 * - Buyer pays GOLD via transferFrom and receives the NFT.
 */
contract DolrathItemMarket is ERC721Holder, Ownable, ReentrancyGuard {
    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 priceGold; // base units
        bool active;
    }

    IERC20 public immutable gold;
    IERC721 public immutable items;

    uint256 public nextListingId = 1;

    mapping(uint256 => Listing) public listings;

    uint256[] private activeListingIds;
    mapping(uint256 => uint256) private activeIndex; // listingId -> index+1

    error NotSeller();
    error NotActive();
    error PriceZero();

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 priceGold);
    event ListingCancelled(uint256 indexed listingId, address indexed seller);
    event ListingPurchased(uint256 indexed listingId, address indexed seller, address indexed buyer, uint256 tokenId, uint256 priceGold);

    constructor(address goldToken, address itemsNft) Ownable(msg.sender) {
        require(goldToken != address(0), "gold=0");
        require(itemsNft != address(0), "items=0");
        gold = IERC20(goldToken);
        items = IERC721(itemsNft);
    }

    function getActiveListingIds() external view returns (uint256[] memory) {
        return activeListingIds;
    }

    function createListing(uint256 tokenId, uint256 priceGold) external nonReentrant returns (uint256 listingId) {
        if (priceGold == 0) revert PriceZero();

        // Escrow the NFT. Requires prior approval.
        items.safeTransferFrom(msg.sender, address(this), tokenId);

        listingId = nextListingId;
        nextListingId += 1;

        listings[listingId] = Listing({seller: msg.sender, tokenId: tokenId, priceGold: priceGold, active: true});

        activeIndex[listingId] = activeListingIds.length + 1;
        activeListingIds.push(listingId);

        emit ListingCreated(listingId, msg.sender, tokenId, priceGold);

        return listingId;
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();
        if (l.seller != msg.sender) revert NotSeller();

        l.active = false;
        _removeActive(listingId);

        items.safeTransferFrom(address(this), msg.sender, l.tokenId);

        emit ListingCancelled(listingId, msg.sender);
    }

    function buy(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();

        l.active = false;
        _removeActive(listingId);

        // Buyer must approve GOLD to this contract.
        require(gold.transferFrom(msg.sender, l.seller, l.priceGold), "gold transfer failed");

        items.safeTransferFrom(address(this), msg.sender, l.tokenId);

        emit ListingPurchased(listingId, l.seller, msg.sender, l.tokenId, l.priceGold);
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
