import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle so the Docker runtime image stays small.
  output: "standalone",
};

export default nextConfig;
