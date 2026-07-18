// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IERC20Burnable is IERC20 {
    function burnFrom(address account, uint256 value) external;
}

/**
 * DolrathItemMarket
 * - Simple escrow marketplace for Dolrath item NFTs.
 * - Seller escrows the item NFT into the contract at a fixed GOLD price.
 * - Buyer pays GOLD via transferFrom and receives the NFT.
 * - Market fee (basis points of the price) is split between a real burn
 *   (supply destruction) and the game treasury; the seller receives the rest.
 * - Pausable: pause blocks new listings and purchases; cancel stays open so
 *   sellers can always recover escrowed NFTs.
 */
contract DolrathItemMarket is ERC721Holder, Ownable, ReentrancyGuard, Pausable {
    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 priceGold; // base units
        bool active;
    }

    uint16 public constant MAX_TOTAL_FEE_BPS = 1000; // 10%

    IERC20Burnable public immutable gold;
    IERC721 public immutable items;

    uint16 public burnFeeBps = 200; // 2%
    uint16 public treasuryFeeBps = 200; // 2%
    address public feeTreasury;

    uint256 public nextListingId = 1;

    mapping(uint256 => Listing) public listings;

    uint256[] private activeListingIds;
    mapping(uint256 => uint256) private activeIndex; // listingId -> index+1
    mapping(uint256 => uint256) private activeListingByTokenId; // tokenId -> listingId (0 = none)

    error NotSeller();
    error NotActive();
    error PriceZero();
    error FeeTooHigh();
    error TreasuryZero();
    error TokenEscrowed();

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 priceGold);
    event ListingCancelled(uint256 indexed listingId, address indexed seller);
    event ListingPurchased(uint256 indexed listingId, address indexed seller, address indexed buyer, uint256 tokenId, uint256 priceGold);
    event MarketFeePaid(uint256 indexed listingId, uint256 burned, uint256 toTreasury);
    event FeesUpdated(uint16 burnFeeBps, uint16 treasuryFeeBps);
    event FeeTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ERC721Rescued(address indexed token, uint256 indexed tokenId, address indexed to);

    constructor(address goldToken, address itemsNft, address feeTreasury_) Ownable(msg.sender) {
        require(goldToken != address(0), "gold=0");
        require(itemsNft != address(0), "items=0");
        if (feeTreasury_ == address(0)) revert TreasuryZero();
        gold = IERC20Burnable(goldToken);
        items = IERC721(itemsNft);
        feeTreasury = feeTreasury_;
        emit FeeTreasuryUpdated(address(0), feeTreasury_);
    }

    function setFees(uint16 burnFeeBps_, uint16 treasuryFeeBps_) external onlyOwner {
        if (uint256(burnFeeBps_) + treasuryFeeBps_ > MAX_TOTAL_FEE_BPS) revert FeeTooHigh();
        burnFeeBps = burnFeeBps_;
        treasuryFeeBps = treasuryFeeBps_;
        emit FeesUpdated(burnFeeBps_, treasuryFeeBps_);
    }

    function setFeeTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert TreasuryZero();
        address old = feeTreasury;
        feeTreasury = newTreasury;
        emit FeeTreasuryUpdated(old, newTreasury);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// Recover an NFT sent directly to the market (without createListing).
    /// Never touches tokens escrowed by an active listing.
    function rescueERC721(address token, uint256 tokenId, address to) external onlyOwner nonReentrant {
        require(to != address(0), "to=0");
        if (token == address(items) && activeListingByTokenId[tokenId] != 0) revert TokenEscrowed();
        IERC721(token).safeTransferFrom(address(this), to, tokenId);
        emit ERC721Rescued(token, tokenId, to);
    }

    function getActiveListingIds() external view returns (uint256[] memory) {
        return activeListingIds;
    }

    /// Seller proceeds for a given price under the current fee config.
    function quoteProceeds(uint256 priceGold) public view returns (uint256 sellerAmount, uint256 burnAmount, uint256 treasuryAmount) {
        burnAmount = (priceGold * burnFeeBps) / 10_000;
        treasuryAmount = (priceGold * treasuryFeeBps) / 10_000;
        sellerAmount = priceGold - burnAmount - treasuryAmount;
    }

    function createListing(uint256 tokenId, uint256 priceGold) external nonReentrant whenNotPaused returns (uint256 listingId) {
        if (priceGold == 0) revert PriceZero();

        // Escrow the NFT. Requires prior approval.
        items.safeTransferFrom(msg.sender, address(this), tokenId);

        listingId = nextListingId;
        nextListingId += 1;

        listings[listingId] = Listing({seller: msg.sender, tokenId: tokenId, priceGold: priceGold, active: true});

        activeIndex[listingId] = activeListingIds.length + 1;
        activeListingIds.push(listingId);
        activeListingByTokenId[tokenId] = listingId;

        emit ListingCreated(listingId, msg.sender, tokenId, priceGold);

        return listingId;
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();
        if (l.seller != msg.sender) revert NotSeller();

        l.active = false;
        _removeActive(listingId);
        delete activeListingByTokenId[l.tokenId];

        items.safeTransferFrom(address(this), msg.sender, l.tokenId);

        emit ListingCancelled(listingId, msg.sender);
    }

    function buy(uint256 listingId) external nonReentrant whenNotPaused {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();

        l.active = false;
        _removeActive(listingId);
        delete activeListingByTokenId[l.tokenId];

        // Buyer must approve GOLD (the full price) to this contract.
        (uint256 sellerAmount, uint256 burnAmount, uint256 treasuryAmount) = quoteProceeds(l.priceGold);

        require(gold.transferFrom(msg.sender, l.seller, sellerAmount), "gold transfer failed");
        if (treasuryAmount > 0) {
            require(gold.transferFrom(msg.sender, feeTreasury, treasuryAmount), "fee transfer failed");
        }
        if (burnAmount > 0) {
            gold.burnFrom(msg.sender, burnAmount);
        }

        items.safeTransferFrom(address(this), msg.sender, l.tokenId);

        emit ListingPurchased(listingId, l.seller, msg.sender, l.tokenId, l.priceGold);
        if (burnAmount > 0 || treasuryAmount > 0) {
            emit MarketFeePaid(listingId, burnAmount, treasuryAmount);
        }
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
