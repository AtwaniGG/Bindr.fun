/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pokedex-slabs/shared'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        url: false,
      };
    }
    // Privy pulls in Farcaster mini-app as an optional peer — we don't use it.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@farcaster/mini-app-solana': false,
    };
    return config;
  },
};

module.exports = nextConfig;
