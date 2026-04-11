import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { PublicKey } from '@solana/web3.js';

@Injectable()
export class SolanaAddressPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    try {
      const key = new PublicKey(value);
      if (!PublicKey.isOnCurve(key)) {
        throw new Error('Not on curve');
      }
      return key.toBase58();
    } catch {
      throw new BadRequestException('Invalid Solana address');
    }
  }
}
