import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Allow server-side usage of native modules
  serverExternalPackages: ["@prisma/client", "prisma", "pdf-parse", "playwright"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // For Docker standalone build
  output: "standalone",
  // Allow large file uploads for resume PDFs
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
