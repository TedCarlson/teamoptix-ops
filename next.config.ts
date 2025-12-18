import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Keep old /metrics links working during the transition to /smart
      {
        source: "/metrics",
        destination: "/smart",
        permanent: false,
      },
      {
        source: "/metrics/:path*",
        destination: "/smart/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
