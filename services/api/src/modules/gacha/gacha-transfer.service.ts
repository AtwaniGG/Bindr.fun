import { Injectable, Logger } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Hash,
} from 'viem';
import { polygon } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { COURTYARD_CONTRACT_ADDRESS } from '@pokedex-slabs/shared';

export interface TransferResult {
  txHash: string;
  success: boolean;
}

/**
 * Handles ERC-721 NFT transfers from the vault wallet on Polygon.
 * Uses viem with a standard ERC-721 transferFrom call.
 *
 * If Courtyard has their own transfer API, this service can be swapped
 * by implementing the same transferNft interface.
 */
@Injectable()
export class GachaTransferService {
  private readonly logger = new Logger(GachaTransferService.name);

  private readonly erc721Abi = parseAbi([
    'function transferFrom(address from, address to, uint256 tokenId)',
    'function ownerOf(uint256 tokenId) view returns (address)',
  ]);

  async transferNft(
    tokenId: string,
    recipientAddress: string,
  ): Promise<TransferResult> {
    const vaultPrivateKey = process.env.GACHA_VAULT_PRIVATE_KEY;
    const polygonRpcUrl = process.env.POLYGON_RPC_URL;
    const vaultAddress = process.env.GACHA_VAULT_ADDRESS;

    if (!vaultPrivateKey || !polygonRpcUrl || !vaultAddress) {
      throw new Error('Missing Polygon vault configuration (GACHA_VAULT_PRIVATE_KEY, POLYGON_RPC_URL, or GACHA_VAULT_ADDRESS)');
    }

    const account = privateKeyToAccount(vaultPrivateKey as `0x${string}`);

    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(polygonRpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain: polygon,
      transport: http(polygonRpcUrl),
    });

    const contractAddress = COURTYARD_CONTRACT_ADDRESS as `0x${string}`;

    // Verify the vault still owns this token
    const currentOwner = (await publicClient.readContract({
      address: contractAddress,
      abi: this.erc721Abi,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    } as any)) as string;

    if (currentOwner.toLowerCase() !== vaultAddress.toLowerCase()) {
      throw new Error(
        `Vault does not own token ${tokenId}. Current owner: ${currentOwner}`,
      );
    }

    this.logger.log(
      `Transferring token ${tokenId} from ${vaultAddress} to ${recipientAddress}`,
    );

    // Execute the transfer
    const txHash = await walletClient.writeContract({
      address: contractAddress,
      abi: this.erc721Abi,
      functionName: 'transferFrom',
      args: [
        vaultAddress as `0x${string}`,
        recipientAddress as `0x${string}`,
        BigInt(tokenId),
      ],
      chain: polygon,
    } as any);

    this.logger.log(`Transfer tx submitted: ${txHash}`);

    // Wait for 1 block confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as Hash,
      confirmations: 1,
    });

    if (receipt.status === 'reverted') {
      throw new Error(`Transfer tx ${txHash} reverted`);
    }

    this.logger.log(`Transfer confirmed in block ${receipt.blockNumber}`);

    return { txHash, success: true };
  }

  /**
   * Check the vault wallet's MATIC balance for gas.
   */
  async getVaultGasBalance(): Promise<number> {
    const polygonRpcUrl = process.env.POLYGON_RPC_URL;
    const vaultAddress = process.env.GACHA_VAULT_ADDRESS;

    if (!polygonRpcUrl || !vaultAddress) return 0;

    const publicClient = createPublicClient({
      chain: polygon,
      transport: http(polygonRpcUrl),
    });

    const balance = await publicClient.getBalance({
      address: vaultAddress as `0x${string}`,
    });

    // Convert wei to MATIC (18 decimals)
    return Number(balance) / 1e18;
  }
}
