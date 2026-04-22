// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";

/**
 * BindrGacha — on-chain gacha picker for Courtyard ERC-721 slabs.
 *
 * - Two pack tiers (0 = Pack25, 1 = Pack100), each with its own card pool.
 * - Each pack has 6 price buckets with admin-mutable weights (basis points, sum = 10000).
 * - `pull` is `onlyBackend` — backend verifies Solana $SLAB burn off-chain, then relays here.
 *   `burnProof` is the Solana tx signature bytes, logged on-chain for audit.
 * - `giveaway` is `onlyOwner` — 1 per wallet, deduped on both polygon and solana addresses.
 * - NFTs stay in the vault wallet. Vault pre-grants `setApprovalForAll(this, true)` on the
 *   Courtyard contract so `safeTransferFrom(VAULT, user, tokenId)` works from here.
 * - RNG: keccak256(prevrandao, timestamp, user, tier, nonce). Acceptable for $25-$100 stakes;
 *   migrate to Chainlink VRF if stakes grow.
 */
contract BindrGacha is Ownable, Pausable {
    // ────────────────────────────────────────────────────────────────────
    // Immutables
    // ────────────────────────────────────────────────────────────────────

    IERC721 public immutable NFT;
    address public vault;

    // ────────────────────────────────────────────────────────────────────
    // Config
    // ────────────────────────────────────────────────────────────────────

    address public backendSigner;
    uint256 private _nonce;

    uint8 public constant NUM_BUCKETS = 6;
    uint16 public constant WEIGHT_TOTAL_BPS = 10000;
    uint8 public constant NUM_PACK_TIERS = 2;

    // ────────────────────────────────────────────────────────────────────
    // Per-pack-tier state
    // ────────────────────────────────────────────────────────────────────

    struct Card {
        uint8 bucket;
        bool available;
    }

    // packTier → tokenId → Card
    mapping(uint8 => mapping(uint256 => Card)) public cards;

    // packTier → bucket → list of available tokenIds (swap-and-pop for O(1) removal)
    mapping(uint8 => mapping(uint8 => uint256[])) private _bucketPool;

    // packTier → tokenId → position in _bucketPool
    mapping(uint8 => mapping(uint256 => uint256)) private _bucketPos;

    // packTier → [w0..w5], sum == WEIGHT_TOTAL_BPS
    mapping(uint8 => uint16[NUM_BUCKETS]) private _bucketWeights;

    // ────────────────────────────────────────────────────────────────────
    // Giveaway dedupe
    // ────────────────────────────────────────────────────────────────────

    mapping(address => bool) public polygonGiveawayUsed;
    mapping(bytes32 => bool) public solanaGiveawayUsed;

    // ────────────────────────────────────────────────────────────────────
    // Events
    // ────────────────────────────────────────────────────────────────────

    event Pulled(
        address indexed user,
        uint8 indexed packTier,
        uint256 indexed tokenId,
        uint8 bucket,
        bytes32 burnProof
    );
    event Giveaway(
        address indexed user,
        uint8 indexed packTier,
        uint256 indexed tokenId,
        uint8 bucket,
        bytes32 solanaHash
    );
    event CardAdded(uint8 indexed packTier, uint256 indexed tokenId, uint8 bucket);
    event CardRemoved(uint8 indexed packTier, uint256 indexed tokenId);
    event WeightsUpdated(uint8 indexed packTier, uint16[NUM_BUCKETS] weights);
    event BackendSignerChanged(address indexed previous, address indexed current);
    event VaultChanged(address indexed previous, address indexed current);

    // ────────────────────────────────────────────────────────────────────
    // Errors
    // ────────────────────────────────────────────────────────────────────

    error NotBackend();
    error InvalidPackTier();
    error InvalidBucket();
    error LengthMismatch();
    error PoolEmpty();
    error AlreadyClaimed();
    error WeightsDoNotSumTo10000();
    error CardAlreadyRegistered();
    error CardNotFound();
    error ZeroAddress();

    // ────────────────────────────────────────────────────────────────────
    // Modifiers
    // ────────────────────────────────────────────────────────────────────

    modifier onlyBackend() {
        if (msg.sender != backendSigner) revert NotBackend();
        _;
    }

    modifier validTier(uint8 packTier) {
        if (packTier >= NUM_PACK_TIERS) revert InvalidPackTier();
        _;
    }

    // ────────────────────────────────────────────────────────────────────
    // Constructor
    // ────────────────────────────────────────────────────────────────────

    constructor(address nft, address initialVault, address initialBackend) Ownable(msg.sender) {
        if (nft == address(0) || initialVault == address(0) || initialBackend == address(0)) revert ZeroAddress();
        NFT = IERC721(nft);
        vault = initialVault;
        backendSigner = initialBackend;

        // Pack25 ships with the target distribution (bps, sums to 10000):
        //   bucket 0 → $17.50 – $20    = 30.90%
        //   bucket 1 → $20    – $25    = 44.86%
        //   bucket 2 → $25    – $50    = 20.94%
        //   bucket 3 → $50    – $100   = 3.00%
        //   bucket 4 → $100   – $200   = 0.20%
        //   bucket 5 → $200   – $299.99 = 0.10%
        uint16[NUM_BUCKETS] memory pack25Weights;
        pack25Weights[0] = 3090;
        pack25Weights[1] = 4486;
        pack25Weights[2] = 2094;
        pack25Weights[3] = 300;
        pack25Weights[4] = 20;
        pack25Weights[5] = 10;
        _bucketWeights[0] = pack25Weights;

        // Pack100 ships with the target distribution (bps, sums to 10000):
        //   bucket 0 → $70   – $85    = 49.85%
        //   bucket 1 → $85   – $100   = 24.93%
        //   bucket 2 → $100  – $200   = 21.93%
        //   bucket 3 → $200  – $400   = 2.99%
        //   bucket 4 → $400  – $1,600 = 0.30%
        //   bucket 5 → unused         = 0.00%
        uint16[NUM_BUCKETS] memory pack100Weights;
        pack100Weights[0] = 4985;
        pack100Weights[1] = 2493;
        pack100Weights[2] = 2193;
        pack100Weights[3] = 299;
        pack100Weights[4] = 30;
        pack100Weights[5] = 0;
        _bucketWeights[1] = pack100Weights;

        emit WeightsUpdated(0, pack25Weights);
        emit WeightsUpdated(1, pack100Weights);
        emit BackendSignerChanged(address(0), initialBackend);
        emit VaultChanged(address(0), initialVault);
    }

    // ────────────────────────────────────────────────────────────────────
    // User-facing (called by backend)
    // ────────────────────────────────────────────────────────────────────

    function pull(address user, uint8 packTier, bytes32 burnProof)
        external
        onlyBackend
        whenNotPaused
        validTier(packTier)
        returns (uint256 tokenId, uint8 bucket)
    {
        if (user == address(0)) revert ZeroAddress();
        (tokenId, bucket) = _pick(user, packTier);
        NFT.safeTransferFrom(vault, user, tokenId);
        emit Pulled(user, packTier, tokenId, bucket, burnProof);
    }

    // ────────────────────────────────────────────────────────────────────
    // Admin
    // ────────────────────────────────────────────────────────────────────

    function giveaway(address user, bytes32 solanaHash, uint8 packTier)
        external
        onlyOwner
        whenNotPaused
        validTier(packTier)
        returns (uint256 tokenId, uint8 bucket)
    {
        if (user == address(0)) revert ZeroAddress();
        if (polygonGiveawayUsed[user] || solanaGiveawayUsed[solanaHash]) revert AlreadyClaimed();
        polygonGiveawayUsed[user] = true;
        solanaGiveawayUsed[solanaHash] = true;

        (tokenId, bucket) = _pick(user, packTier);
        NFT.safeTransferFrom(vault, user, tokenId);
        emit Giveaway(user, packTier, tokenId, bucket, solanaHash);
    }

    function addCards(uint8 packTier, uint256[] calldata tokenIds, uint8[] calldata buckets)
        external
        onlyOwner
        validTier(packTier)
    {
        if (tokenIds.length != buckets.length) revert LengthMismatch();
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            uint8 b = buckets[i];
            if (b >= NUM_BUCKETS) revert InvalidBucket();
            if (cards[packTier][tokenId].available) revert CardAlreadyRegistered();

            cards[packTier][tokenId] = Card({ bucket: b, available: true });
            _bucketPos[packTier][tokenId] = _bucketPool[packTier][b].length;
            _bucketPool[packTier][b].push(tokenId);
            emit CardAdded(packTier, tokenId, b);
        }
    }

    function removeCard(uint8 packTier, uint256 tokenId)
        external
        onlyOwner
        validTier(packTier)
    {
        if (!cards[packTier][tokenId].available) revert CardNotFound();
        uint8 bucket = cards[packTier][tokenId].bucket;
        _removeFromBucket(packTier, bucket, tokenId);
        delete cards[packTier][tokenId];
        emit CardRemoved(packTier, tokenId);
    }

    function setBucketWeights(uint8 packTier, uint16[NUM_BUCKETS] calldata weights)
        external
        onlyOwner
        validTier(packTier)
    {
        uint256 sum;
        for (uint8 i = 0; i < NUM_BUCKETS; i++) sum += weights[i];
        if (sum != WEIGHT_TOTAL_BPS) revert WeightsDoNotSumTo10000();
        _bucketWeights[packTier] = weights;
        emit WeightsUpdated(packTier, weights);
    }

    function setBackendSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address prev = backendSigner;
        backendSigner = newSigner;
        emit BackendSignerChanged(prev, newSigner);
    }

    /**
     * @notice Rotate the vault wallet that holds the NFT inventory. The new vault
     *         MUST call `setApprovalForAll(this, true)` on the NFT contract before
     *         the next pull/giveaway — otherwise transfers revert.
     */
    function setVault(address newVault) external onlyOwner {
        if (newVault == address(0)) revert ZeroAddress();
        address prev = vault;
        vault = newVault;
        emit VaultChanged(prev, newVault);
    }

    function setPaused(bool paused_) external onlyOwner {
        if (paused_) _pause();
        else _unpause();
    }

    // ────────────────────────────────────────────────────────────────────
    // Views
    // ────────────────────────────────────────────────────────────────────

    function availableInBucket(uint8 packTier, uint8 bucket)
        external
        view
        validTier(packTier)
        returns (uint256)
    {
        if (bucket >= NUM_BUCKETS) revert InvalidBucket();
        return _bucketPool[packTier][bucket].length;
    }

    function availableInPack(uint8 packTier) external view validTier(packTier) returns (uint256 total) {
        for (uint8 b = 0; b < NUM_BUCKETS; b++) total += _bucketPool[packTier][b].length;
    }

    function getBucketWeights(uint8 packTier)
        external
        view
        validTier(packTier)
        returns (uint16[NUM_BUCKETS] memory)
    {
        return _bucketWeights[packTier];
    }

    // ────────────────────────────────────────────────────────────────────
    // Internal
    // ────────────────────────────────────────────────────────────────────

    function _pick(address user, uint8 packTier) private returns (uint256 tokenId, uint8 bucket) {
        uint256 rand = uint256(keccak256(
            abi.encode(block.prevrandao, block.timestamp, user, packTier, _nonce)
        ));
        unchecked { _nonce++; }

        bucket = _rollBucket(rand, packTier);

        // Fallback: if the rolled bucket is empty, scan forward (wrap) until one has cards
        uint8 tries;
        while (_bucketPool[packTier][bucket].length == 0 && tries < NUM_BUCKETS) {
            bucket = (bucket + 1) % NUM_BUCKETS;
            tries++;
        }
        uint256 len = _bucketPool[packTier][bucket].length;
        if (len == 0) revert PoolEmpty();

        uint256 idx = (rand >> 128) % len;
        tokenId = _bucketPool[packTier][bucket][idx];
        _removeFromBucketByIndex(packTier, bucket, idx);
        cards[packTier][tokenId].available = false;
    }

    function _rollBucket(uint256 rand, uint8 packTier) private view returns (uint8) {
        uint16[NUM_BUCKETS] storage w = _bucketWeights[packTier];
        uint16 roll = uint16(rand % WEIGHT_TOTAL_BPS);
        uint16 acc;
        for (uint8 i = 0; i < NUM_BUCKETS; i++) {
            acc += w[i];
            if (roll < acc) return i;
        }
        return NUM_BUCKETS - 1;
    }

    function _removeFromBucket(uint8 packTier, uint8 bucket, uint256 tokenId) private {
        uint256 idx = _bucketPos[packTier][tokenId];
        _removeFromBucketByIndex(packTier, bucket, idx);
    }

    function _removeFromBucketByIndex(uint8 packTier, uint8 bucket, uint256 idx) private {
        uint256[] storage pool = _bucketPool[packTier][bucket];
        uint256 lastIdx = pool.length - 1;
        if (idx != lastIdx) {
            uint256 lastTokenId = pool[lastIdx];
            pool[idx] = lastTokenId;
            _bucketPos[packTier][lastTokenId] = idx;
        }
        pool.pop();
    }
}
