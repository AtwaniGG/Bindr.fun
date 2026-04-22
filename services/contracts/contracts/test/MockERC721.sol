// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/** Minimal ERC-721 used by BindrGacha tests. */
contract MockERC721 is ERC721 {
    constructor() ERC721("MockSlab", "MSLAB") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function batchMint(address to, uint256[] calldata tokenIds) external {
        for (uint256 i = 0; i < tokenIds.length; i++) _mint(to, tokenIds[i]);
    }
}
