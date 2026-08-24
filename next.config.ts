import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@modelcontextprotocol/sdk"],
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;