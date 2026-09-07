import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd(), ".."),
  turbopack: {
    root: path.join(process.cwd(), ".."),
  },
  // Use TypeScript's compiler API during Next's build-time type check. The
  // CLI path in Next 16.3 can lose the --showConfig stream in restricted
  // process environments even though the project itself type-checks cleanly.
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
