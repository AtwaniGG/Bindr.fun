// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import { VRFConsumerBaseV2Plus } from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import { VRFV2PlusClient } from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC721 } from "@openzeppelin/contracts/interfaces/IERC721.sol";

/**
 * BindrGachaV2 — bulletproofed for $25 stakes.
 *
 * Differences vs V1:
 *  - RNG via Chainlink VRF v2.5 (validator-manipulation-proof). Pull is now async:
 *    `requestPull` (onlyBackend) → VRF coordinator → `fulfillRandomWords` callback
 *    does the actual pick + safeTransferFrom.
 *  - On-chain `usedBurnProofs` mapping: same Solana burn signature can never be
 *    replayed, even if the backend has a bug.
 *  - Per-user rate limit: at most one pull per user every MIN_PULL_INTERVAL_BLOCKS.
 *  - Per-block global cap: at most MAX_PULLS_PER_BLOCK requests in any block.
 *  - `pauseGuardian` hot-key role with one power: emergencyPause(). Lets you stop
 *    a live exploit while the cold owner key takes time to sign.
 *  - `withdrawCard(packTier, tokenId, to)`: owner can recover a specific card via
 *    the contract — keeps the bucket/cards bookkeeping consistent.
 *  - `giveaway` is now deterministic — owner picks the tokenId. Removes any RNG
 *    concern from promo flows; owner controlled it anyway.
 *  - `cancelPendingPull(requestId)`: owner escape hatch for stuck VRF requests.
 *
 * Same trust model on roles:
 *  - owner (cold wallet): god-mode for config + giveaway + pause/unpause + withdrawCard
 *  - backendSigner (hot key on Railway): can call requestPull
 *  - pauseGuardian (separate hot key): only call emergencyPause
 *  - vault (preferably multisig): holds NFTs, must setApprovalForAll(this, true)
 */
contract BindrGachaV2 is VRFConsumerBaseV2Plus, Pausable, ReentrancyGuard {
    // ────────────────────────────────────────────────────────────────────
    // Immutables
    // ────────────────────────────────────────────────────────────────────

    IERC721 public immutable NFT;
    bytes32 public immutable VRF_KEY_HASH;
    uint256 public immutable VRF_SUBSCRIPTION_ID;
    bool public immutable VRF_NATIVE_PAYMENT;

    // ────────────────────────────────────────────────────────────────────
    // Mutable config
    // ────────────────────────────────────────────────────────────────────

    address public vault;
    address public backendSigner;
    address public pauseGuardian;

    uint32 public callbackGasLimit;       // VRF callback gas budget
    uint16 public requestConfirmations;   // VRF confirmations before fulfillment

    // Anti-drain rate limits
    uint256 public minPullIntervalBlocks; // per-user cooldown (in blocks)
    uint8 public maxPullsPerBlock;        // global cap per block

    // ────────────────────────────────────────────────────────────────────
    // Constants
    // ────────────────────────────────────────────────────────────────────

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

    mapping(uint8 => mapping(uint256 => Card)) public cards;
    mapping(uint8 => mapping(uint8 => uint256[])) private _bucketPool;
    mapping(uint8 => mapping(uint256 => uint256)) private _bucketPos;
    mapping(uint8 => uint16[NUM_BUCKETS]) private _bucketWeights;

    // ────────────────────────────────────────────────────────────────────
    // Anti-drain bookkeeping
    // ────────────────────────────────────────────────────────────────────

    mapping(bytes32 => bool) public usedBurnProofs;
    mapping(address => uint256) public lastPullBlock;
    mapping(uint256 => uint8) public pullsInBlock; // block number → count

    // ────────────────────────────────────────────────────────────────────
    // VRF pending request state
    // ────────────────────────────────────────────────────────────────────

    struct PullRequest {
        address user;
        uint8 packTier;
        bytes32 burnProof;
        uint64 timestamp;
        bool fulfilled;
        bool cancelled;
        // Snapshot of `vault` at request time so a mid-flight setVault doesn't
        // strand fulfilled pulls against the new (empty) vault.
        address vaultAtRequest;
        // If safeTransferFrom in fulfillRandomWords reverts (e.g. recipient is
        // a contract that doesn't implement onERC721Received), we leave the
        // pick recorded here for the user to claim later via claimPending.
        uint256 awaitingClaimTokenId;
        uint8 awaitingClaimBucket;
        bool awaitingClaim;
    }

    mapping(uint256 => PullRequest) public pendingPulls; // VRF requestId → PullRequest

    // ────────────────────────────────────────────────────────────────────
    // Giveaway dedupe
    // ────────────────────────────────────────────────────────────────────

    mapping(address => bool) public polygonGiveawayUsed;
    mapping(bytes32 => bool) public solanaGiveawayUsed;

    // ────────────────────────────────────────────────────────────────────
    // Events
    // ────────────────────────────────────────────────────────────────────

    event PullRequested(
        uint256 indexed requestId,
        address indexed user,
        uint8 indexed packTier,
        bytes32 burnProof
    );
    event Pulled(
        uint256 indexed requestId,
        address indexed user,
        uint8 indexed packTier,
        uint256 tokenId,
        uint8 bucket,
        bytes32 burnProof
    );
    event PullAwaitingClaim(
        uint256 indexed requestId,
        address indexed user,
        uint256 tokenId,
        uint8 bucket,
        bytes32 reason
    );
    event PullClaimed(uint256 indexed requestId, address indexed to, uint256 tokenId);
    event PullCancelled(uint256 indexed requestId, address indexed user, bytes32 burnProof, uint8 packTier);
    event Giveaway(
        address indexed user,
        uint8 indexed packTier,
        uint256 indexed tokenId,
        uint8 bucket,
        bytes32 solanaHash
    );
    event CardAdded(uint8 indexed packTier, uint256 indexed tokenId, uint8 bucket);
    event CardRemoved(uint8 indexed packTier, uint256 indexed tokenId);
    event CardWithdrawn(uint8 indexed packTier, uint256 indexed tokenId, address indexed to);
    event WeightsUpdated(uint8 indexed packTier, uint16[NUM_BUCKETS] weights);
    event BackendSignerChanged(address indexed previous, address indexed current);
    event VaultChanged(address indexed previous, address indexed current);
    event PauseGuardianChanged(address indexed previous, address indexed current);
    event RateLimitsUpdated(uint256 minPullIntervalBlocks, uint8 maxPullsPerBlock);
    event VrfConfigUpdated(uint32 callbackGasLimit, uint16 requestConfirmations);

    // ────────────────────────────────────────────────────────────────────
    // Errors
    // ────────────────────────────────────────────────────────────────────

    error NotBackend();
    error NotAuthorizedToPause();
    error InvalidPackTier();
    error InvalidBucket();
    error LengthMismatch();
    error PoolEmpty();
    error AlreadyClaimed();
    error WeightsDoNotSumTo10000();
    error CardAlreadyRegistered();
    error CardNotFound();
    error BurnProofAlreadyUsed();
    error BurnProofZero();
    error PullCooldownActive();
    error BlockPullCapReached();
    error RequestNotPending();
    error RequestAlreadyFulfilled();
    error NothingToClaim();
    error InvalidVrfConfig();

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

    struct InitConfig {
        address nft;
        address initialVault;
        address initialBackend;
        address initialPauseGuardian;
        address vrfCoordinator;
        bytes32 vrfKeyHash;
        uint256 vrfSubscriptionId;
        bool vrfNativePayment;
        uint32 callbackGasLimit;
        uint16 requestConfirmations;
        uint256 minPullIntervalBlocks;
        uint8 maxPullsPerBlock;
    }

    constructor(InitConfig memory cfg) VRFConsumerBaseV2Plus(cfg.vrfCoordinator) {
        if (
            cfg.nft == address(0) ||
            cfg.initialVault == address(0) ||
            cfg.initialBackend == address(0) ||
            cfg.initialPauseGuardian == address(0)
        ) revert ZeroAddress();
        if (cfg.callbackGasLimit < 250_000 || cfg.callbackGasLimit > 2_500_000) revert InvalidVrfConfig();
        if (cfg.requestConfirmations < 3 || cfg.requestConfirmations > 200) revert InvalidVrfConfig();

        NFT = IERC721(cfg.nft);
        VRF_KEY_HASH = cfg.vrfKeyHash;
        VRF_SUBSCRIPTION_ID = cfg.vrfSubscriptionId;
        VRF_NATIVE_PAYMENT = cfg.vrfNativePayment;

        vault = cfg.initialVault;
        backendSigner = cfg.initialBackend;
        pauseGuardian = cfg.initialPauseGuardian;
        callbackGasLimit = cfg.callbackGasLimit;
        requestConfirmations = cfg.requestConfirmations;
        minPullIntervalBlocks = cfg.minPullIntervalBlocks;
        maxPullsPerBlock = cfg.maxPullsPerBlock;

        // Pack25 default weights (bps, sum 10000)
        uint16[NUM_BUCKETS] memory pack25Weights;
        pack25Weights[0] = 3090;
        pack25Weights[1] = 4486;
        pack25Weights[2] = 2094;
        pack25Weights[3] = 300;
        pack25Weights[4] = 20;
        pack25Weights[5] = 10;
        _bucketWeights[0] = pack25Weights;

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
        emit BackendSignerChanged(address(0), cfg.initialBackend);
        emit VaultChanged(address(0), cfg.initialVault);
        emit PauseGuardianChanged(address(0), cfg.initialPauseGuardian);
        emit RateLimitsUpdated(cfg.minPullIntervalBlocks, cfg.maxPullsPerBlock);
        emit VrfConfigUpdated(cfg.callbackGasLimit, cfg.requestConfirmations);
    }

    // ────────────────────────────────────────────────────────────────────
    // Pull flow (2-step: requestPull → fulfillRandomWords)
    // ────────────────────────────────────────────────────────────────────

    /**
     * Backend calls this after verifying a Solana $SLAB burn off-chain.
     * Returns the VRF requestId; backend stores it on the GachaPull row and
     * waits for the Pulled event (or polls pendingPulls(requestId).fulfilled).
     */
    function requestPull(address user, uint8 packTier, bytes32 burnProof)
        external
        onlyBackend
        whenNotPaused
        validTier(packTier)
        nonReentrant
        returns (uint256 requestId)
    {
        if (user == address(0)) revert ZeroAddress();
        if (burnProof == bytes32(0)) revert BurnProofZero();
        if (usedBurnProofs[burnProof]) revert BurnProofAlreadyUsed();
        // Cooldown applies on every pull including first — `lastPullBlock`
        // defaults to 0 which is `< block.number - cooldown` for any
        // realistic block.number, so the first pull always passes; subsequent
        // pulls within the window correctly revert.
        if (block.number < lastPullBlock[user] + minPullIntervalBlocks) {
            revert PullCooldownActive();
        }
        if (pullsInBlock[block.number] >= maxPullsPerBlock) revert BlockPullCapReached();

        // Pre-flight inventory check
        uint256 totalAvail;
        for (uint8 b = 0; b < NUM_BUCKETS; b++) totalAvail += _bucketPool[packTier][b].length;
        if (totalAvail == 0) revert PoolEmpty();

        usedBurnProofs[burnProof] = true;
        lastPullBlock[user] = block.number;
        pullsInBlock[block.number] += 1;

        VRFV2PlusClient.RandomWordsRequest memory req = VRFV2PlusClient.RandomWordsRequest({
            keyHash: VRF_KEY_HASH,
            subId: VRF_SUBSCRIPTION_ID,
            requestConfirmations: requestConfirmations,
            callbackGasLimit: callbackGasLimit,
            numWords: 1,
            extraArgs: VRFV2PlusClient._argsToBytes(
                VRFV2PlusClient.ExtraArgsV1({ nativePayment: VRF_NATIVE_PAYMENT })
            )
        });
        requestId = s_vrfCoordinator.requestRandomWords(req);

        pendingPulls[requestId] = PullRequest({
            user: user,
            packTier: packTier,
            burnProof: burnProof,
            timestamp: uint64(block.timestamp),
            fulfilled: false,
            cancelled: false,
            vaultAtRequest: vault,
            awaitingClaimTokenId: 0,
            awaitingClaimBucket: 0,
            awaitingClaim: false
        });

        emit PullRequested(requestId, user, packTier, burnProof);
    }

    /// @dev Called by the VRF coordinator only.
    function fulfillRandomWords(uint256 requestId, uint256[] calldata randomWords) internal override {
        PullRequest storage r = pendingPulls[requestId];
        if (r.user == address(0) || r.fulfilled || r.cancelled) revert RequestNotPending();
        r.fulfilled = true;

        uint256 rand = randomWords[0];
        (uint256 tokenId, uint8 bucket) = _pick(rand, r.packTier);

        // Use the vault snapshot from request time so a mid-flight setVault
        // doesn't strand fulfilled pulls. Wrap the transfer in try/catch so a
        // recipient that doesn't implement onERC721Received (or any other
        // recoverable failure) parks the pull in `awaitingClaim` instead of
        // bricking the burn proof.
        address fromVault = r.vaultAtRequest == address(0) ? vault : r.vaultAtRequest;
        try NFT.safeTransferFrom(fromVault, r.user, tokenId) {
            emit Pulled(requestId, r.user, r.packTier, tokenId, bucket, r.burnProof);
        } catch {
            r.awaitingClaim = true;
            r.awaitingClaimTokenId = tokenId;
            r.awaitingClaimBucket = bucket;
            emit PullAwaitingClaim(requestId, r.user, tokenId, bucket, "transferFailed");
        }
    }

    /**
     * Claim a pull whose VRF callback succeeded but whose `safeTransferFrom`
     * failed (e.g. the user wallet is a contract that doesn't implement
     * `onERC721Received`). The owner can deliver to a new address — useful
     * if the original `r.user` is permanently incapable of receiving.
     */
    function claimPending(uint256 requestId, address to)
        external
        whenNotPaused
        nonReentrant
    {
        PullRequest storage r = pendingPulls[requestId];
        if (!r.awaitingClaim) revert NothingToClaim();
        // Either the original recipient OR owner may claim. Owner override
        // exists for support cases where the original wallet is dead.
        if (msg.sender != r.user && msg.sender != owner()) revert NotAuthorizedToPause();
        address dest = to == address(0) ? r.user : to;
        if (dest == address(0)) revert ZeroAddress();

        uint256 tokenId = r.awaitingClaimTokenId;
        r.awaitingClaim = false;

        address fromVault = r.vaultAtRequest == address(0) ? vault : r.vaultAtRequest;
        NFT.safeTransferFrom(fromVault, dest, tokenId);
        emit PullClaimed(requestId, dest, tokenId);
    }

    /**
     * Owner escape hatch for a request that VRF never fulfills (network
     * outage, sub depleted, etc.). Marks it cancelled so it can't be
     * picked up later. The on-chain side-effects of requestPull
     * (usedBurnProofs, lastPullBlock, pullsInBlock) are NOT undone — the
     * burn happened; you'll handle the user-side refund off-chain.
     */
    function cancelPendingPull(uint256 requestId) external onlyOwner {
        PullRequest storage r = pendingPulls[requestId];
        if (r.user == address(0) || r.fulfilled || r.cancelled) revert RequestNotPending();
        r.cancelled = true;
        emit PullCancelled(requestId, r.user, r.burnProof, r.packTier);
    }

    // ────────────────────────────────────────────────────────────────────
    // Giveaway (synchronous, deterministic)
    // ────────────────────────────────────────────────────────────────────

    /**
     * Owner-controlled freebie. Owner picks the exact tokenId — no RNG needed.
     * Same on-chain dedupe as v1: 1 per polygon address + 1 per solana hash.
     */
    function giveaway(address user, bytes32 solanaHash, uint8 packTier, uint256 tokenId)
        external
        onlyOwner
        whenNotPaused
        validTier(packTier)
        nonReentrant
    {
        if (user == address(0)) revert ZeroAddress();
        if (polygonGiveawayUsed[user] || solanaGiveawayUsed[solanaHash]) revert AlreadyClaimed();
        if (!cards[packTier][tokenId].available) revert CardNotFound();

        polygonGiveawayUsed[user] = true;
        solanaGiveawayUsed[solanaHash] = true;

        uint8 bucket = cards[packTier][tokenId].bucket;
        _removeFromBucket(packTier, bucket, tokenId);
        cards[packTier][tokenId].available = false;
        NFT.safeTransferFrom(vault, user, tokenId);

        emit Giveaway(user, packTier, tokenId, bucket, solanaHash);
    }

    // ────────────────────────────────────────────────────────────────────
    // Inventory admin
    // ────────────────────────────────────────────────────────────────────

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

    /**
     * Admin recovery: pulls a card out of the contract registry AND moves it
     * from the vault to `to` in the same tx, so on-chain ownership and the
     * contract's bookkeeping stay in sync.
     */
    function withdrawCard(uint8 packTier, uint256 tokenId, address to)
        external
        onlyOwner
        validTier(packTier)
        nonReentrant
    {
        if (to == address(0)) revert ZeroAddress();
        if (!cards[packTier][tokenId].available) revert CardNotFound();
        uint8 bucket = cards[packTier][tokenId].bucket;
        _removeFromBucket(packTier, bucket, tokenId);
        delete cards[packTier][tokenId];
        NFT.safeTransferFrom(vault, to, tokenId);
        emit CardWithdrawn(packTier, tokenId, to);
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

    // ────────────────────────────────────────────────────────────────────
    // Role admin
    // ────────────────────────────────────────────────────────────────────

    function setBackendSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit BackendSignerChanged(backendSigner, newSigner);
        backendSigner = newSigner;
    }

    function setVault(address newVault) external onlyOwner {
        if (newVault == address(0)) revert ZeroAddress();
        emit VaultChanged(vault, newVault);
        vault = newVault;
    }

    function setPauseGuardian(address newGuardian) external onlyOwner {
        if (newGuardian == address(0)) revert ZeroAddress();
        emit PauseGuardianChanged(pauseGuardian, newGuardian);
        pauseGuardian = newGuardian;
    }

    // ────────────────────────────────────────────────────────────────────
    // Pause (split: emergencyPause is hot, unpause is cold)
    // ────────────────────────────────────────────────────────────────────

    function emergencyPause() external {
        if (msg.sender != owner() && msg.sender != pauseGuardian) revert NotAuthorizedToPause();
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ────────────────────────────────────────────────────────────────────
    // Tunable config
    // ────────────────────────────────────────────────────────────────────

    function setRateLimits(uint256 newMinPullIntervalBlocks, uint8 newMaxPullsPerBlock) external onlyOwner {
        minPullIntervalBlocks = newMinPullIntervalBlocks;
        maxPullsPerBlock = newMaxPullsPerBlock;
        emit RateLimitsUpdated(newMinPullIntervalBlocks, newMaxPullsPerBlock);
    }

    function setVrfConfig(uint32 newCallbackGasLimit, uint16 newRequestConfirmations) external onlyOwner {
        // Bounds prevent operator from setting values that brick fulfillments
        // (gas too low → callback reverts) or weaken VRF security (confirmations too low).
        if (newCallbackGasLimit < 250_000 || newCallbackGasLimit > 2_500_000) revert InvalidVrfConfig();
        if (newRequestConfirmations < 3 || newRequestConfirmations > 200) revert InvalidVrfConfig();
        callbackGasLimit = newCallbackGasLimit;
        requestConfirmations = newRequestConfirmations;
        emit VrfConfigUpdated(newCallbackGasLimit, newRequestConfirmations);
    }

    // ────────────────────────────────────────────────────────────────────
    // Views
    // ────────────────────────────────────────────────────────────────────

    function availableInBucket(uint8 packTier, uint8 bucket)
        external view validTier(packTier) returns (uint256)
    {
        if (bucket >= NUM_BUCKETS) revert InvalidBucket();
        return _bucketPool[packTier][bucket].length;
    }

    function availableInPack(uint8 packTier) external view validTier(packTier) returns (uint256 total) {
        for (uint8 b = 0; b < NUM_BUCKETS; b++) total += _bucketPool[packTier][b].length;
    }

    function getBucketWeights(uint8 packTier)
        external view validTier(packTier) returns (uint16[NUM_BUCKETS] memory)
    {
        return _bucketWeights[packTier];
    }

    /**
     * Returns whether the contract can currently transfer NFTs out of the
     * vault. The backend should call this before sending a $SLAB-burn tx
     * — if false, refuse the burn instead of stranding the user.
     */
    function isVaultReady() external view returns (bool) {
        return NFT.isApprovedForAll(vault, address(this));
    }

    // ────────────────────────────────────────────────────────────────────
    // Internal
    // ────────────────────────────────────────────────────────────────────

    function _pick(uint256 rand, uint8 packTier) private returns (uint256 tokenId, uint8 bucket) {
        bucket = _rollBucket(rand, packTier);

        // If the rolled bucket is empty we fall through to the next non-empty
        // bucket. This silently shifts odds away from the advertised
        // distribution as buckets drain. Operators must keep buckets stocked
        // OR zero out the weight of any empty bucket to keep odds honest.
        // We still cascade (vs reverting) because reverting a fulfilled VRF
        // request strands the burn proof — see C-2 in the audit.
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
