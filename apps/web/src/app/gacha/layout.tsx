'use client';

import dynamic from 'next/dynamic';

const SolanaWalletProvider = dynamic(
  () => import('./providers').then((m) => m.SolanaWalletProvider),
  { ssr: false },
);

export default function GachaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SolanaWalletProvider>{children}</SolanaWalletProvider>;
}
