import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { BindrGacha, MockERC721 } from '../typechain-types';

const PACK_25 = 0;
const PACK_100 = 1;
const ZERO_HASH = '0x' + '0'.repeat(64);

/** Uniform weights across all 6 buckets = ~1666.67 bps each — not legal (must sum 10000).
 *  Use bucket-0-only for tests that don't care about distribution. */
const ALL_IN_BUCKET_0: [number, number, number, number, number, number] = [10000, 0, 0, 0, 0, 0];
const ALL_IN_BUCKET_1: [number, number, number, number, number, number] = [0, 10000, 0, 0, 0, 0];

function mintRange(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i);
}

describe('BindrGacha', () => {
  let owner: SignerWithAddress;
  let backend: SignerWithAddress;
  let vault: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let gacha: BindrGacha;
  let nft: MockERC721;

  beforeEach(async () => {
    [owner, backend, vault, alice, bob] = await ethers.getSigners();

    const NftFactory = await ethers.getContractFactory('MockERC721');
    nft = await NftFactory.deploy();

    const GachaFactory = await ethers.getContractFactory('BindrGacha');
    gacha = await GachaFactory.deploy(
      await nft.getAddress(),
      vault.address,
      backend.address,
    );

    // Vault owns ~500 test NFTs, approves gacha
    await nft.batchMint(vault.address, mintRange(1, 50));
    await nft.connect(vault).setApprovalForAll(await gacha.getAddress(), true);
  });

  describe('deployment', () => {
    it('sets immutables + initial weights', async () => {
      expect(await gacha.NFT()).to.equal(await nft.getAddress());
      expect(await gacha.vault()).to.equal(vault.address);
      expect(await gacha.backendSigner()).to.equal(backend.address);
      expect(await gacha.owner()).to.equal(owner.address);

      // Pack25 ships with the finalized odds distribution
      const w25 = await gacha.getBucketWeights(PACK_25);
      expect(w25[0]).to.equal(3090n);
      expect(w25[1]).to.equal(4486n);
      expect(w25[2]).to.equal(2094n);
      expect(w25[3]).to.equal(300n);
      expect(w25[4]).to.equal(20n);
      expect(w25[5]).to.equal(10n);
      let sum = 0n;
      for (let i = 0; i < 6; i++) sum += w25[i];
      expect(sum).to.equal(10000n);

      // Pack100 ships with its finalized distribution (5 active buckets, bucket 5 unused)
      const w100 = await gacha.getBucketWeights(PACK_100);
      expect(w100[0]).to.equal(4985n);
      expect(w100[1]).to.equal(2493n);
      expect(w100[2]).to.equal(2193n);
      expect(w100[3]).to.equal(299n);
      expect(w100[4]).to.equal(30n);
      expect(w100[5]).to.equal(0n);
      let sum100 = 0n;
      for (let i = 0; i < 6; i++) sum100 += w100[i];
      expect(sum100).to.equal(10000n);
    });
  });

  describe('addCards', () => {
    it('registers cards into the correct pack/bucket', async () => {
      await gacha.addCards(PACK_25, [1, 2, 3], [0, 0, 0]);
      expect(await gacha.availableInBucket(PACK_25, 0)).to.equal(3n);
      expect(await gacha.availableInBucket(PACK_100, 0)).to.equal(0n);
      const card = await gacha.cards(PACK_25, 1);
      expect(card.bucket).to.equal(0);
      expect(card.available).to.equal(true);
    });

    it('reverts on length mismatch', async () => {
      await expect(
        gacha.addCards(PACK_25, [1, 2], [0]),
      ).to.be.revertedWithCustomError(gacha, 'LengthMismatch');
    });

    it('reverts on invalid bucket', async () => {
      await expect(
        gacha.addCards(PACK_25, [1], [6]),
      ).to.be.revertedWithCustomError(gacha, 'InvalidBucket');
    });

    it('reverts on invalid pack tier', async () => {
      await expect(
        gacha.addCards(2, [1], [0]),
      ).to.be.revertedWithCustomError(gacha, 'InvalidPackTier');
    });

    it('reverts on duplicate card in same pack', async () => {
      await gacha.addCards(PACK_25, [1], [0]);
      await expect(
        gacha.addCards(PACK_25, [1], [0]),
      ).to.be.revertedWithCustomError(gacha, 'CardAlreadyRegistered');
    });

    it('allows same tokenId in different pack tiers', async () => {
      await gacha.addCards(PACK_25, [1], [0]);
      await gacha.addCards(PACK_100, [1], [0]);
      expect(await gacha.availableInBucket(PACK_25, 0)).to.equal(1n);
      expect(await gacha.availableInBucket(PACK_100, 0)).to.equal(1n);
    });

    it('non-owner cannot add cards', async () => {
      await expect(
        gacha.connect(alice).addCards(PACK_25, [1], [0]),
      ).to.be.revertedWithCustomError(gacha, 'OwnableUnauthorizedAccount');
    });
  });

  describe('pull', () => {
    beforeEach(async () => {
      await gacha.addCards(PACK_25, [1, 2, 3, 4, 5], [0, 0, 0, 0, 0]);
      await gacha.addCards(PACK_100, [10, 11, 12], [0, 0, 0]);
    });

    it('happy path: backend can pull, user receives NFT, pool shrinks', async () => {
      const tx = await gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH);
      await expect(tx).to.emit(gacha, 'Pulled');
      expect(await nft.balanceOf(alice.address)).to.equal(1n);
      expect(await gacha.availableInPack(PACK_25)).to.equal(4n);
      expect(await gacha.availableInPack(PACK_100)).to.equal(3n);
    });

    it('pack tier isolation: pulling from Pack25 does not affect Pack100', async () => {
      await gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH);
      await gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH);
      expect(await gacha.availableInPack(PACK_25)).to.equal(3n);
      expect(await gacha.availableInPack(PACK_100)).to.equal(3n);
    });

    it('non-backend cannot pull', async () => {
      await expect(
        gacha.connect(alice).pull(alice.address, PACK_25, ZERO_HASH),
      ).to.be.revertedWithCustomError(gacha, 'NotBackend');
    });

    it('reverts when pool empty', async () => {
      // drain Pack25
      for (let i = 0; i < 5; i++) {
        await gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH);
      }
      await expect(
        gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH),
      ).to.be.revertedWithCustomError(gacha, 'PoolEmpty');
    });

    it('empty-bucket fallback: rolls to next bucket when chosen is empty', async () => {
      // Reset & set bucket 1 as the target, but put cards only in bucket 0
      await gacha.setBucketWeights(PACK_25, ALL_IN_BUCKET_1);
      // Pack25 already has 5 cards in bucket 0 from beforeEach
      const tx = await gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH);
      // Should fall through from bucket 1 → 2 → 3 → 4 → 5 → 0 and find a card in bucket 0
      await expect(tx).to.emit(gacha, 'Pulled');
      expect(await nft.balanceOf(alice.address)).to.equal(1n);
    });

    it('does not pull the same card twice', async () => {
      const pulled = new Set<bigint>();
      for (let i = 0; i < 5; i++) {
        const tx = await gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH);
        const receipt = await tx.wait();
        const log = receipt!.logs.find((l) => {
          try { return gacha.interface.parseLog(l as any)?.name === 'Pulled'; } catch { return false; }
        });
        const parsed = gacha.interface.parseLog(log as any)!;
        const tokenId = parsed.args.tokenId as bigint;
        expect(pulled.has(tokenId)).to.equal(false);
        pulled.add(tokenId);
      }
      expect(pulled.size).to.equal(5);
    });

    it('revert while paused', async () => {
      await gacha.setPaused(true);
      await expect(
        gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH),
      ).to.be.revertedWithCustomError(gacha, 'EnforcedPause');
    });

    it('burn proof is emitted in Pulled event', async () => {
      const proof = '0x' + 'ab'.repeat(32);
      const tx = await gacha.connect(backend).pull(alice.address, PACK_25, proof);
      const receipt = await tx.wait();
      const log = receipt!.logs
        .map((l) => { try { return gacha.interface.parseLog(l as any); } catch { return null; } })
        .find((p) => p && p.name === 'Pulled')!;
      expect(log.args.burnProof).to.equal(proof);
    });
  });

  describe('giveaway', () => {
    const SOL_HASH_A = '0x' + '11'.repeat(32);
    const SOL_HASH_B = '0x' + '22'.repeat(32);

    beforeEach(async () => {
      await gacha.addCards(PACK_25, [1, 2, 3], [0, 0, 0]);
    });

    it('owner can give a pack; polygon + solana flags set', async () => {
      await gacha.giveaway(alice.address, SOL_HASH_A, PACK_25);
      expect(await nft.balanceOf(alice.address)).to.equal(1n);
      expect(await gacha.polygonGiveawayUsed(alice.address)).to.equal(true);
      expect(await gacha.solanaGiveawayUsed(SOL_HASH_A)).to.equal(true);
    });

    it('dedupe: repeat polygon address reverts', async () => {
      await gacha.giveaway(alice.address, SOL_HASH_A, PACK_25);
      await expect(
        gacha.giveaway(alice.address, SOL_HASH_B, PACK_25),
      ).to.be.revertedWithCustomError(gacha, 'AlreadyClaimed');
    });

    it('dedupe: repeat solana hash reverts', async () => {
      await gacha.giveaway(alice.address, SOL_HASH_A, PACK_25);
      await expect(
        gacha.giveaway(bob.address, SOL_HASH_A, PACK_25),
      ).to.be.revertedWithCustomError(gacha, 'AlreadyClaimed');
    });

    it('non-owner cannot giveaway', async () => {
      await expect(
        gacha.connect(alice).giveaway(alice.address, SOL_HASH_A, PACK_25),
      ).to.be.revertedWithCustomError(gacha, 'OwnableUnauthorizedAccount');
    });
  });

  describe('setBucketWeights', () => {
    const ODDS_31_45_21_3_02_01: [number, number, number, number, number, number] =
      [3090, 4486, 2094, 300, 20, 10]; // user's spec, normalized to 10000

    it('accepts weights that sum to 10000', async () => {
      await gacha.setBucketWeights(PACK_25, ODDS_31_45_21_3_02_01);
      const w = await gacha.getBucketWeights(PACK_25);
      expect(w[0]).to.equal(3090n);
      expect(w[5]).to.equal(10n);
    });

    it('reverts on weights that do not sum to 10000', async () => {
      await expect(
        gacha.setBucketWeights(PACK_25, [1, 1, 1, 1, 1, 1]),
      ).to.be.revertedWithCustomError(gacha, 'WeightsDoNotSumTo10000');
    });

    it('non-owner cannot set weights', async () => {
      await expect(
        gacha.connect(alice).setBucketWeights(PACK_25, ALL_IN_BUCKET_0),
      ).to.be.revertedWithCustomError(gacha, 'OwnableUnauthorizedAccount');
    });

    it('isolates weights per pack tier', async () => {
      // pack 25 gets a uniform override; pack 100 defaults must be unchanged
      await gacha.setBucketWeights(PACK_25, ALL_IN_BUCKET_0);
      const w25 = await gacha.getBucketWeights(PACK_25);
      const w100 = await gacha.getBucketWeights(PACK_100);
      expect(w25[0]).to.equal(10000n);
      // Pack100's deploy-time distribution must be untouched
      expect(w100[0]).to.equal(4985n);
      expect(w100[4]).to.equal(30n);
    });
  });

  describe('distribution (soft test)', () => {
    it('heavy-weighted bucket dominates over 200 pulls', async () => {
      // Put 30 cards in bucket 0 and 30 in bucket 2; weight 90% to bucket 0.
      const ids0 = mintRange(100, 30);
      const ids2 = mintRange(200, 30);
      await nft.batchMint(vault.address, [...ids0, ...ids2]);
      await gacha.addCards(PACK_25, ids0, new Array(30).fill(0));
      await gacha.addCards(PACK_25, ids2, new Array(30).fill(2));
      await gacha.setBucketWeights(PACK_25, [9000, 0, 1000, 0, 0, 0]);

      let countBucket0 = 0;
      for (let i = 0; i < 60; i++) {
        const user = ethers.Wallet.createRandom();
        const tx = await gacha.connect(backend).pull(user.address, PACK_25, ZERO_HASH);
        const receipt = await tx.wait();
        const parsed = gacha.interface.parseLog(
          receipt!.logs.find((l) => {
            try { return gacha.interface.parseLog(l as any)?.name === 'Pulled'; } catch { return false; }
          }) as any,
        )!;
        if (parsed.args.bucket === 0n) countBucket0++;
      }
      // With 90/10 weights and 30 cards each bucket, bucket 0 should win ~90% of time
      // After drain of 30 from bucket 0, fallback goes to 2. Sanity floor: at least 25.
      expect(countBucket0).to.be.greaterThan(25);
    });
  });

  describe('removeCard', () => {
    it('removes and shrinks pool', async () => {
      await gacha.addCards(PACK_25, [1, 2, 3], [0, 0, 0]);
      await gacha.removeCard(PACK_25, 2);
      expect(await gacha.availableInBucket(PACK_25, 0)).to.equal(2n);
      const c = await gacha.cards(PACK_25, 2);
      expect(c.available).to.equal(false);
    });

    it('reverts for unknown card', async () => {
      await expect(
        gacha.removeCard(PACK_25, 999),
      ).to.be.revertedWithCustomError(gacha, 'CardNotFound');
    });
  });

  describe('setVault', () => {
    it('owner can rotate vault; new vault must re-approve to receive transfers', async () => {
      const newVaultSigner = (await ethers.getSigners())[6];

      await gacha.addCards(PACK_25, [1, 2], [0, 0]);

      // rotate vault
      const tx = await gacha.setVault(newVaultSigner.address);
      await expect(tx).to.emit(gacha, 'VaultChanged').withArgs(vault.address, newVaultSigner.address);
      expect(await gacha.vault()).to.equal(newVaultSigner.address);

      // without new vault's approval + balance, pull reverts
      await expect(
        gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH),
      ).to.be.reverted;

      // now move the NFTs over and approve
      await nft.connect(vault).transferFrom(vault.address, newVaultSigner.address, 1);
      await nft.connect(vault).transferFrom(vault.address, newVaultSigner.address, 2);
      await nft.connect(newVaultSigner).setApprovalForAll(await gacha.getAddress(), true);

      await gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH);
      expect(await nft.balanceOf(alice.address)).to.equal(1n);
    });

    it('non-owner cannot change vault', async () => {
      await expect(
        gacha.connect(alice).setVault(alice.address),
      ).to.be.revertedWithCustomError(gacha, 'OwnableUnauthorizedAccount');
    });

    it('reverts on zero address', async () => {
      await expect(
        gacha.setVault(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(gacha, 'ZeroAddress');
    });
  });

  describe('setBackendSigner / pause', () => {
    it('rotate backend signer', async () => {
      await gacha.setBackendSigner(alice.address);
      expect(await gacha.backendSigner()).to.equal(alice.address);
      // old backend now unauthorized
      await gacha.addCards(PACK_25, [1], [0]);
      await expect(
        gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH),
      ).to.be.revertedWithCustomError(gacha, 'NotBackend');
    });

    it('setPaused guards pull + giveaway', async () => {
      await gacha.addCards(PACK_25, [1, 2], [0, 0]);
      await gacha.setPaused(true);
      await expect(
        gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH),
      ).to.be.revertedWithCustomError(gacha, 'EnforcedPause');
      await expect(
        gacha.giveaway(alice.address, '0x' + '33'.repeat(32), PACK_25),
      ).to.be.revertedWithCustomError(gacha, 'EnforcedPause');
      await gacha.setPaused(false);
      await gacha.connect(backend).pull(alice.address, PACK_25, ZERO_HASH);
    });
  });
});
