// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITile {
    function buy(uint256 tokenId) external payable;
    function listForSale(uint256 tokenId, uint256 priceWei) external;
}

/// A seller that tries to re-enter buy() the moment it is paid.
/// Used only in tests, to prove the guard is real rather than assumed.
contract ReentrantSeller {
    ITile public tile;
    uint256 public target;
    bool public tried;

    constructor(address tile_) { tile = ITile(tile_); }

    function list(uint256 tokenId, uint256 price) external {
        target = tokenId;
        tile.listForSale(tokenId, price);
    }

    receive() external payable {
        if (!tried) {
            tried = true;
            // Should revert with "Reentrant call"; swallowed so the outer buy()
            // can still complete and the test can assert on the flag.
            try tile.buy{ value: msg.value }(target) {} catch {}
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata)
        external pure returns (bytes4) { return this.onERC721Received.selector; }
}
