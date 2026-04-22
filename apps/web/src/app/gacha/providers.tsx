'use client';

import { useMemo } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { WagmiProvider, createConfig } from '@privy-io/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { polygon } from 'wagmi/chains';
import { http } from 'wagmi';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

const wagmiConfig = createConfig({
  chains: [polygon],
  transports: { [polygon.id]: http() },
});

const queryClient = new QueryClient();

export function SolanaWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const solanaConnectors = useMemo(() => toSolanaWalletConnectors(), []);

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'apple', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#B1D235',
          walletChainType: 'ethereum-and-solana',
        },
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
          solana: { createOnLogin: 'users-without-wallets' },
        },
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },
        defaultChain: polygon,
        supportedChains: [polygon],
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
