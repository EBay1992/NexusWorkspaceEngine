import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@orbit/shared-types", "@orbit/yjs-protocol"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
