import { SolanaWalletProvider } from './providers';

export const metadata = {
  title: 'Gacha | Bindr.fun',
  description: 'Burn $SLAB tokens to pull a random graded Pokemon card NFT',
};

export default function GachaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SolanaWalletProvider>{children}</SolanaWalletProvider>;
}
