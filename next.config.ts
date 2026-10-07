import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg uses Node built-ins; keep it out of the server bundle.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
