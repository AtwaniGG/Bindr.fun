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
    return config;
  },
};

module.exports = nextConfig;
