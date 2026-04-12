'use client';

import { useEffect, useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { polygon, solana } from '@reown/appkit/networks';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const projectId = '308cb07d4c7d0afe5e2a096d23ddfc50';

const metadata = {
  name: 'Bindr.fun Gacha',
  description: 'Burn $SLAB, pull a Pokemon card',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://bindr.fun',
  icons: ['https://bindr.fun/logo.svg'],
};

const wagmiAdapter = new WagmiAdapter({
  networks: [polygon],
  projectId,
  ssr: false,
});

const solanaAdapter = new SolanaAdapter();

createAppKit({
  adapters: [wagmiAdapter, solanaAdapter],
  networks: [polygon, solana],
  projectId,
  metadata,
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#B1D235',
    '--w3m-border-radius-master': '2px',
  },
});

const queryClient = new QueryClient();

export function SolanaWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <>{children}</>;

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
