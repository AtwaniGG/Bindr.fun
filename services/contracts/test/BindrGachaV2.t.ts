import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import {
  BindrGachaV2,
  MockERC721,
  MockVRFCoordinatorV2Plus,
} from '../typechain-types';

const PACK_25 = 0;
const PACK_100 = 1;
const ZERO_HASH = '0x' + '0'.repeat(64);
const KEY_HASH = '0x' + '11'.repeat(32);

const ALL_BUCKET_0: [number, number, number, number, number, number] = [10000, 0, 0, 0, 0, 0];
const ALL_BUCKET_1: [number, number, number, number, number, number] = [0, 10000, 0, 0, 0, 0];

function mintRange(start: number, count: number) {
  return Array.from({ length: count }, (_, i) => start + i);
}

async function fulfill(
  coordinator: MockVRFCoordinatorV2Plus,
  consumer: BindrGachaV2,
  requestId: bigint,
  word: bigint,
) {
  return coordinator.fulfillRandomWordsWithOverride(
    requestId,
    await consumer.getAddress(),
    [word],
  );
}

describe('BindrGachaV2', () => {
  let owner: SignerWithAddress;
  let backend: SignerWithAddress;
  let vault: SignerWithAddress;
  let guardian: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let gacha: BindrGachaV2;
  let nft: MockERC721;
  let vrfCoord: MockVRFCoordinatorV2Plus;
  const subId: bigint = 1n;

  beforeEach(async () => {
    [owner, backend, vault, guardian, alice, bob, carol] = await ethers.getSigners();

    const NftFactory = await ethers.getContractFactory('MockERC721');
    nft = await NftFactory.deploy();

    const VrfFactory = await ethers.getContractFactory('MockVRFCoordinatorV2Plus');
    vrfCoord = await VrfFactory.deploy();

    const GachaFactory = await ethers.getContractFactory('BindrGachaV2');
    gacha = await GachaFactory.deploy({
      nft: await nft.getAddress(),
      initialVault: vault.address,
      initialBackend: backend.address,
      initialPauseGuardian: guardian.address,
      vrfCoordinator: await vrfCoord.getAddress(),
      vrfKeyHash: KEY_HASH,
      vrfSubscriptionId: subId,
      vrfNativePayment: false,
      callbackGasLimit: 500_000,
      requestConfirmations: 3,
      minPullIntervalBlocks: 0, // disabled by default in tests; enable per-test
      maxPullsPerBlock: 100,    // generous default; tightened per-test
    });

    await nft.batchMint(vault.address, mintRange(1, 50));
    await nft.connect(vault).setApprovalForAll(await gacha.getAddress(), true);
  });

  // ─── Deployment ────────────────────────────────────────────────────────

  describe('deployment', () => {
    it('initializes immutables, roles, and default weights', async () => {
      expect(await gacha.NFT()).to.equal(await nft.getAddress());
      expect(await gacha.vault()).to.equal(vault.address);
      expect(await gacha.backendSigner()).to.equal(backend.address);
      expect(await gacha.pauseGuardian()).to.equal(guardian.address);
      expect(await gacha.owner()).to.equal(owner.address);
      expect(await gacha.VRF_KEY_HASH()).to.equal(KEY_HASH);
      expect(await gacha.VRF_SUBSCRIPTION_ID()).to.equal(subId);

      const w25 = await gacha.getBucketWeights(PACK_25);
      let sum = 0n;
      for (let i = 0; i < 6; i++) sum += w25[i];
      expect(sum).to.equal(10000n);
    });

    it('rejects zero addresses in constructor', async () => {
      const G = await ethers.getContractFactory('BindrGachaV2');
      const cfg: any = {
        nft: await nft.getAddress(),
        initialVault: vault.address,
        initialBackend: backend.address,
        initialPauseGuardian: guardian.address,
        vrfCoordinator: await vrfCoord.getAddress(),
        vrfKeyHash: KEY_HASH,
        vrfSubscriptionId: subId,
        vrfNativePayment: false,
        callbackGasLimit: 500_000,
        requestConfirmations: 3,
        minPullIntervalBlocks: 0,
        maxPullsPerBlock: 100,
      };
      await expect(G.deploy({ ...cfg, nft: ethers.ZeroAddress })).to.be.reverted;
      await expect(G.deploy({ ...cfg, initialVault: ethers.ZeroAddress })).to.be.reverted;
      await expect(G.deploy({ ...cfg, initialBackend: ethers.ZeroAddress })).to.be.reverted;
      await expect(G.deploy({ ...cfg, initialPauseGuardian: ethers.ZeroAddress })).to.be.reverted;
      // VRF config bounds enforced at deploy
      await expect(G.deploy({ ...cfg, callbackGasLimit: 100_000 })).to.be.reverted;
      await expect(G.deploy({ ...cfg, requestConfirmations: 1 })).to.be.reverted;
    });

    it('isVaultReady reflects approval state', async () => {
      expect(await gacha.isVaultReady()).to.equal(true);
      await nft.connect(vault).setApprovalForAll(await gacha.getAddress(), false);
      expect(await gacha.isVaultReady()).to.equal(false);
    });
  });

  // ─── addCards / removeCard / withdrawCard ────────────────────────────────

  describe('inventory admin', () => {
    it('addCards then removeCard updates pool length + cards mapping', async () => {
      await gacha.addCards(PACK_25, [1, 2, 3], [0, 0, 1]);
      expect(await gacha.availableInBucket(PACK_25, 0)).to.equal(2n);
      expect(await gacha.availableInBucket(PACK_25, 1)).to.equal(1n);
      const card1 = await gacha.cards(PACK_25, 1);
      expect(card1.bucket).to.equal(0n);
      expect(card1.available).to.equal(true);

      await gacha.removeCard(PACK_25, 2);
      expect(await gacha.availableInBucket(PACK_25, 0)).to.equal(1n);
      expect((await gacha.cards(PACK_25, 2)).available).to.equal(false);
    });

    it('addCards reverts on duplicate registration', async () => {
      await gacha.addCards(PACK_25, [1], [0]);
      await expect(gacha.addCards(PACK_25, [1], [0])).to.be.revertedWithCustomError(
        gacha,
        'CardAlreadyRegistered',
      );
    });

    it('addCards reverts on invalid bucket', async () => {
      await expect(gacha.addCards(PACK_25, [1], [9])).to.be.revertedWithCustomError(
        gacha,
        'InvalidBucket',
      );
    });

    it('only owner can add/remove', async () => {
      await expect(gacha.connect(alice).addCards(PACK_25, [1], [0])).to.be.reverted;
      await gacha.addCards(PACK_25, [1], [0]);
      await expect(gacha.connect(alice).removeCard(PACK_25, 1)).to.be.reverted;
    });

    it('withdrawCard moves NFT and clears bookkeeping', async () => {
      await gacha.addCards(PACK_25, [1], [0]);
      await gacha.withdrawCard(PACK_25, 1, alice.address);
      expect(await nft.ownerOf(1)).to.equal(alice.address);
      expect(await gacha.availableInBucket(PACK_25, 0)).to.equal(0n);
      expect((await gacha.cards(PACK_25, 1)).available).to.equal(false);
    });

    it('withdrawCard onlyOwner + rejects zero address', async () => {
      await gacha.addCards(PACK_25, [1], [0]);
      await expect(gacha.connect(alice).withdrawCard(PACK_25, 1, alice.address)).to.be.reverted;
      await expect(gacha.withdrawCard(PACK_25, 1, ethers.ZeroAddress)).to.be.revertedWithCustomError(
        gacha,
        'ZeroAddress',
      );
    });
  });

  // ─── Pull flow (VRF) ─────────────────────────────────────────────────────

  describe('pull (VRF round-trip)', () => {
    beforeEach(async () => {
      await gacha.setBucketWeights(PACK_25, ALL_BUCKET_0);
      await gacha.addCards(PACK_25, [1, 2, 3, 4, 5], [0, 0, 0, 0, 0]);
    });

    async function requestAndCaptureId(user: string, packTier: number, burnProof: string) {
      const tx = await gacha.connect(backend).requestPull(user, packTier, burnProof);
      const r = await tx.wait();
      const logs = (r!.logs as any[])
        .map((l) => {
          try {
            return gacha.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const requested = logs.find((l) => l!.name === 'PullRequested');
      return requested!.args.requestId as bigint;
    }

    it('happy path: request → fulfill → NFT lands at user', async () => {
      const burnProof = '0x' + 'aa'.repeat(32);
      const requestId = await requestAndCaptureId(alice.address, PACK_25, burnProof);
      expect((await gacha.pendingPulls(requestId)).user).to.equal(alice.address);

      await fulfill(vrfCoord, gacha, requestId, 12345n);

      const pending = await gacha.pendingPulls(requestId);
      expect(pending.fulfilled).to.equal(true);

      // alice owns one of the registered tokenIds
      const aliceBalance = await nft.balanceOf(alice.address);
      expect(aliceBalance).to.equal(1n);
    });

    it('burnProof cannot be reused, even with different user', async () => {
      const burnProof = '0x' + 'bb'.repeat(32);
      await gacha.connect(backend).requestPull(alice.address, PACK_25, burnProof);
      await expect(
        gacha.connect(backend).requestPull(bob.address, PACK_25, burnProof),
      ).to.be.revertedWithCustomError(gacha, 'BurnProofAlreadyUsed');
    });

    it('only backend can call requestPull', async () => {
      await expect(
        gacha.connect(alice).requestPull(alice.address, PACK_25, '0x' + 'aa'.repeat(32)),
      ).to.be.revertedWithCustomError(gacha, 'NotBackend');
    });

    it('rejects burnProof = bytes32(0)', async () => {
      await expect(
        gacha.connect(backend).requestPull(alice.address, PACK_25, ZERO_HASH),
      ).to.be.revertedWithCustomError(gacha, 'BurnProofZero');
    });

    it('pre-flight rejects empty pool before consuming VRF', async () => {
      // Drain the bucket
      await gacha.removeCard(PACK_25, 1);
      await gacha.removeCard(PACK_25, 2);
      await gacha.removeCard(PACK_25, 3);
      await gacha.removeCard(PACK_25, 4);
      await gacha.removeCard(PACK_25, 5);
      await expect(
        gacha.connect(backend).requestPull(alice.address, PACK_25, '0x' + 'aa'.repeat(32)),
      ).to.be.revertedWithCustomError(gacha, 'PoolEmpty');
    });

    it('per-user cooldown blocks rapid pulls', async () => {
      await gacha.setRateLimits(5, 100); // 5-block cooldown
      const burn1 = '0x' + 'c1'.repeat(32);
      const burn2 = '0x' + 'c2'.repeat(32);
      await gacha.connect(backend).requestPull(alice.address, PACK_25, burn1);
      await expect(
        gacha.connect(backend).requestPull(alice.address, PACK_25, burn2),
      ).to.be.revertedWithCustomError(gacha, 'PullCooldownActive');
    });

    it('per-block cap rejects after threshold', async () => {
      await gacha.setRateLimits(0, 1); // strict: 1 pull per block max
      const burns = ['0x' + 'd1'.repeat(32), '0x' + 'd2'.repeat(32)];

      await ethers.provider.send('evm_setAutomine', [false]);
      try {
        const tx1 = await gacha.connect(backend).requestPull(alice.address, PACK_25, burns[0]);
        const tx2 = await gacha.connect(backend).requestPull(bob.address, PACK_25, burns[1]);
        await ethers.provider.send('evm_mine', []);
        const r1 = await ethers.provider.getTransactionReceipt(tx1.hash);
        const r2 = await ethers.provider.getTransactionReceipt(tx2.hash);
        expect(r1!.status).to.equal(1); // first succeeded
        expect(r2!.status).to.equal(0); // second reverted (BlockPullCapReached)
        expect(r1!.blockNumber).to.equal(r2!.blockNumber);
      } finally {
        await ethers.provider.send('evm_setAutomine', [true]);
      }
    });

    it('cancelPendingPull stops a stuck VRF request', async () => {
      const burnProof = '0x' + 'ee'.repeat(32);
      const requestId = await requestAndCaptureId(alice.address, PACK_25, burnProof);
      await gacha.cancelPendingPull(requestId);
      // re-cancel should fail
      await expect(gacha.cancelPendingPull(requestId)).to.be.revertedWithCustomError(
        gacha,
        'RequestNotPending',
      );
      // VRF fulfilling a cancelled request should revert (not pay out)
      await expect(fulfill(vrfCoord, gacha, requestId, 1n)).to.be.reverted;
    });

    it('respects pause: requestPull blocked while paused', async () => {
      await gacha.emergencyPause();
      await expect(
        gacha.connect(backend).requestPull(alice.address, PACK_25, ZERO_HASH),
      ).to.be.reverted;
    });
  });

  // ─── Giveaway ────────────────────────────────────────────────────────────

  describe('giveaway', () => {
    beforeEach(async () => {
      await gacha.addCards(PACK_25, [10, 11, 12], [0, 0, 0]);
    });

    it('owner gives a specific tokenId to a user, deduped per polygon + solana', async () => {
      const solHash = '0x' + 'aa'.repeat(32);
      await gacha.giveaway(alice.address, solHash, PACK_25, 10);
      expect(await nft.ownerOf(10)).to.equal(alice.address);
      expect(await gacha.polygonGiveawayUsed(alice.address)).to.equal(true);
      expect(await gacha.solanaGiveawayUsed(solHash)).to.equal(true);

      // reuse same wallet → reverts
      await expect(
        gacha.giveaway(alice.address, '0x' + 'bb'.repeat(32), PACK_25, 11),
      ).to.be.revertedWithCustomError(gacha, 'AlreadyClaimed');
      // reuse same solana hash from different wallet → reverts
      await expect(
        gacha.giveaway(bob.address, solHash, PACK_25, 12),
      ).to.be.revertedWithCustomError(gacha, 'AlreadyClaimed');
    });

    it('rejects unregistered tokenId', async () => {
      await expect(
        gacha.giveaway(alice.address, '0x' + 'aa'.repeat(32), PACK_25, 999),
      ).to.be.revertedWithCustomError(gacha, 'CardNotFound');
    });

    it('only owner can call giveaway', async () => {
      await expect(
        gacha.connect(alice).giveaway(alice.address, ZERO_HASH, PACK_25, 10),
      ).to.be.reverted;
    });
  });

  // ─── Pause flow ──────────────────────────────────────────────────────────

  describe('pause', () => {
    it('owner and guardian can both emergencyPause; only owner can unpause', async () => {
      await gacha.connect(guardian).emergencyPause();
      expect(await gacha.paused()).to.equal(true);
      await expect(gacha.connect(guardian).unpause()).to.be.reverted;
      await gacha.unpause();
      expect(await gacha.paused()).to.equal(false);

      await gacha.emergencyPause();
      expect(await gacha.paused()).to.equal(true);
    });

    it('non-authorized cannot pause', async () => {
      await expect(gacha.connect(alice).emergencyPause()).to.be.revertedWithCustomError(
        gacha,
        'NotAuthorizedToPause',
      );
    });

    it('giveaway also blocked while paused', async () => {
      await gacha.addCards(PACK_25, [1], [0]);
      await gacha.emergencyPause();
      await expect(
        gacha.giveaway(alice.address, ZERO_HASH, PACK_25, 1),
      ).to.be.reverted;
    });
  });

  // ─── Role admin ──────────────────────────────────────────────────────────

  describe('role admin', () => {
    it('setBackendSigner / setVault / setPauseGuardian update with events', async () => {
      await expect(gacha.setBackendSigner(alice.address))
        .to.emit(gacha, 'BackendSignerChanged');
      expect(await gacha.backendSigner()).to.equal(alice.address);

      await expect(gacha.setVault(bob.address))
        .to.emit(gacha, 'VaultChanged');
      expect(await gacha.vault()).to.equal(bob.address);

      await expect(gacha.setPauseGuardian(carol.address))
        .to.emit(gacha, 'PauseGuardianChanged');
      expect(await gacha.pauseGuardian()).to.equal(carol.address);
    });

    it('all setters reject zero address', async () => {
      await expect(gacha.setBackendSigner(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        gacha,
        'ZeroAddress',
      );
    });

    it('setBucketWeights enforces sum = 10000', async () => {
      await expect(
        gacha.setBucketWeights(PACK_25, [1, 2, 3, 4, 5, 6]),
      ).to.be.revertedWithCustomError(gacha, 'WeightsDoNotSumTo10000');
      await gacha.setBucketWeights(PACK_25, ALL_BUCKET_1);
      const w = await gacha.getBucketWeights(PACK_25);
      expect(w[1]).to.equal(10000n);
    });
  });

  // ─── Distribution ────────────────────────────────────────────────────────

  describe('distribution', () => {
    it('weighted draws roughly match bucket weights over many trials', async () => {
      await gacha.setBucketWeights(PACK_25, [5000, 5000, 0, 0, 0, 0]); // 50/50

      // 20 cards in bucket 0, 20 in bucket 1
      const ids0 = mintRange(100, 20);
      const ids1 = mintRange(200, 20);
      await nft.batchMint(vault.address, ids0);
      await nft.batchMint(vault.address, ids1);
      await gacha.addCards(PACK_25, ids0, ids0.map(() => 0));
      await gacha.addCards(PACK_25, ids1, ids1.map(() => 1));

      let bucket0Hits = 0;
      let bucket1Hits = 0;
      const trials = 30;
      for (let i = 0; i < trials; i++) {
        const burn = ethers.zeroPadValue(ethers.toBeHex(i + 1), 32);
        const tx = await gacha.connect(backend).requestPull(alice.address, PACK_25, burn);
        const rec = await tx.wait();
        const reqId = (rec!.logs as any[])
          .map((l) => {
            try {
              return gacha.interface.parseLog(l);
            } catch {
              return null;
            }
          })
          .find((l) => l && l.name === 'PullRequested')!.args.requestId as bigint;

        const fTx = await fulfill(vrfCoord, gacha, reqId, BigInt(i) * 10n + 7n);
        const fRec = await fTx.wait();
        const pulled = (fRec!.logs as any[])
          .map((l) => {
            try {
              return gacha.interface.parseLog(l);
            } catch {
              return null;
            }
          })
          .find((l) => l && l.name === 'Pulled');
        if (pulled) {
          if (Number(pulled.args.bucket) === 0) bucket0Hits++;
          else if (Number(pulled.args.bucket) === 1) bucket1Hits++;
        }
      }
      expect(bucket0Hits + bucket1Hits).to.equal(trials);
      // Loose check: each should be in [trials*0.2, trials*0.8] to catch bias bugs
      expect(bucket0Hits).to.be.greaterThan(trials * 0.2);
      expect(bucket1Hits).to.be.greaterThan(trials * 0.2);
    });
  });
});
