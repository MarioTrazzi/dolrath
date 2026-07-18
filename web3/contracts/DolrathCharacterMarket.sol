// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

interface IERC20BurnableDol is IERC20 {
    function burnFrom(address account, uint256 value) external;
}

/**
 * DolrathCharacterMarket
 * - Simple escrow marketplace for Dolrath character NFTs.
 * - Seller escrows the character NFT into the contract at a fixed DOL price.
 * - Buyer pays DOL via transferFrom and receives the NFT.
 * - Market fee (basis points of the price) is split between a real burn
 *   (supply destruction) and the game treasury; the seller receives the rest.
 * - Pausable: pause blocks new listings and purchases; cancel stays open so
 *   sellers can always recover escrowed NFTs.
 */
contract DolrathCharacterMarket is ERC721Holder, Ownable, ReentrancyGuard, Pausable {
    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 priceDol; // base units
        bool active;
    }

    uint16 public constant MAX_TOTAL_FEE_BPS = 1000; // 10%

    IERC20BurnableDol public immutable dol;
    IERC721 public immutable characters;

    uint16 public burnFeeBps = 250; // 2.5%
    uint16 public treasuryFeeBps = 250; // 2.5%
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

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 priceDol);
    event ListingCancelled(uint256 indexed listingId, address indexed seller);
    event ListingPurchased(
        uint256 indexed listingId,
        address indexed seller,
        address indexed buyer,
        uint256 tokenId,
        uint256 priceDol
    );
    event MarketFeePaid(uint256 indexed listingId, uint256 burned, uint256 toTreasury);
    event FeesUpdated(uint16 burnFeeBps, uint16 treasuryFeeBps);
    event FeeTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ERC721Rescued(address indexed token, uint256 indexed tokenId, address indexed to);

    constructor(address dolToken, address characterNft, address feeTreasury_) Ownable(msg.sender) {
        require(dolToken != address(0), "dol=0");
        require(characterNft != address(0), "nft=0");
        if (feeTreasury_ == address(0)) revert TreasuryZero();
        dol = IERC20BurnableDol(dolToken);
        characters = IERC721(characterNft);
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
        if (token == address(characters) && activeListingByTokenId[tokenId] != 0) revert TokenEscrowed();
        IERC721(token).safeTransferFrom(address(this), to, tokenId);
        emit ERC721Rescued(token, tokenId, to);
    }

    function getActiveListingIds() external view returns (uint256[] memory) {
        return activeListingIds;
    }

    /// Seller proceeds for a given price under the current fee config.
    function quoteProceeds(uint256 priceDol) public view returns (uint256 sellerAmount, uint256 burnAmount, uint256 treasuryAmount) {
        burnAmount = (priceDol * burnFeeBps) / 10_000;
        treasuryAmount = (priceDol * treasuryFeeBps) / 10_000;
        sellerAmount = priceDol - burnAmount - treasuryAmount;
    }

    function createListing(uint256 tokenId, uint256 priceDol) external nonReentrant whenNotPaused returns (uint256 listingId) {
        if (priceDol == 0) revert PriceZero();

        // Escrow the NFT. Requires prior approval.
        characters.safeTransferFrom(msg.sender, address(this), tokenId);

        listingId = nextListingId;
        nextListingId += 1;

        listings[listingId] = Listing({seller: msg.sender, tokenId: tokenId, priceDol: priceDol, active: true});

        activeIndex[listingId] = activeListingIds.length + 1;
        activeListingIds.push(listingId);
        activeListingByTokenId[tokenId] = listingId;

        emit ListingCreated(listingId, msg.sender, tokenId, priceDol);

        return listingId;
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();
        if (l.seller != msg.sender) revert NotSeller();

        l.active = false;
        _removeActive(listingId);
        delete activeListingByTokenId[l.tokenId];

        characters.safeTransferFrom(address(this), msg.sender, l.tokenId);

        emit ListingCancelled(listingId, msg.sender);
    }

    function buy(uint256 listingId) external nonReentrant whenNotPaused {
        Listing storage l = listings[listingId];
        if (!l.active) revert NotActive();

        l.active = false;
        _removeActive(listingId);
        delete activeListingByTokenId[l.tokenId];

        // Buyer must approve DOL (the full price) to this contract.
        (uint256 sellerAmount, uint256 burnAmount, uint256 treasuryAmount) = quoteProceeds(l.priceDol);

        require(dol.transferFrom(msg.sender, l.seller, sellerAmount), "dol transfer failed");
        if (treasuryAmount > 0) {
            require(dol.transferFrom(msg.sender, feeTreasury, treasuryAmount), "fee transfer failed");
        }
        if (burnAmount > 0) {
            dol.burnFrom(msg.sender, burnAmount);
        }

        characters.safeTransferFrom(address(this), msg.sender, l.tokenId);

        emit ListingPurchased(listingId, l.seller, msg.sender, l.tokenId, l.priceDol);
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
