import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The contract ships as TypeScript source, so Next compiles it with the app.
  transpilePackages: ["@siteproof/contract"],
  cacheComponents: true,
  partialPrefetching: true,
  // The development badge sits bottom-right, clear of the builder's sidebar.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
