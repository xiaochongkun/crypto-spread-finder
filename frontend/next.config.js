/** @type {import("next").NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "/spread-finder";

const nextConfig = {
  output: "standalone",
  basePath,
  reactStrictMode: true,
  // Caddy will handle API routing directly to the backend
  // No rewrites needed - API calls will go to /spread-finder/api/* via Caddy
};

module.exports = nextConfig;
