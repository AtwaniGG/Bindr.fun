'use client';

import dynamic from 'next/dynamic';

const SolanaWalletProvider = dynamic(
  () => import('../gacha/providers').then((m) => m.SolanaWalletProvider),
  { ssr: false },
);

export default function CardsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SolanaWalletProvider>{children}</SolanaWalletProvider>;
}
