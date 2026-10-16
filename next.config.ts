import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  // The access-card template and font are read from disk at runtime, which the
  // build can't see, so list them for every admin route (cards are made by the
  // admin actions and the download route).
  outputFileTracingIncludes: {
    "/admin": ["./template/access-card-template.pdf", "./template/fonts/NotoSans-Bold-Latin.ttf"],
    "/admin/**": ["./template/access-card-template.pdf", "./template/fonts/NotoSans-Bold-Latin.ttf"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
