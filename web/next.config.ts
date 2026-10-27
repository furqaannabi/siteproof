import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The contract ships as TypeScript source, so Next compiles it with the app.
  transpilePackages: ["@siteproof/contract"],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
