/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/spread-finder';
const apiProxy = process.env.NEXT_PUBLIC_API_PROXY_DEST || 'http://127.0.0.1:3115';

const nextConfig = {
  output: 'standalone',
  basePath,
  reactStrictMode: true,
  async rewrites() {
    // Proxy browser requests for /api/* to backend to avoid CORS
    return [
      {
        source: `${basePath}/api/:path*`,
        destination: `${apiProxy}/api/:path*`
      },
      {
        // also allow bare /api when served at domain root during local dev
        source: `/api/:path*`,
        destination: `${apiProxy}/api/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
