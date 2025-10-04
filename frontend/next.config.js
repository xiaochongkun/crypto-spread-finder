/** @type {import("next").NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/spread-finder";
const apiProxy = "http://127.0.0.1:3115";

const nextConfig = {
  output: "standalone",
  basePath,
  reactStrictMode: true,
  async rewrites() {
    // Proxy browser requests for /api/* to backend to avoid CORS
    // Backend API expects /spread-finder/api/* (with basePath prefix)
    return [
      {
        source: `${basePath}/api/:path*`,
        destination: `${apiProxy}/spread-finder/api/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
