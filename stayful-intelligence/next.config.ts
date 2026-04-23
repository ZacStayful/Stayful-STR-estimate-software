import path from "node:path";
import type { NextConfig } from "next";

/**
 * Keep Turbopack's workspace root pinned to this project so it doesn't get
 * confused by the parent repo's lockfile when developed side-by-side.
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(import.meta.dirname ?? __dirname, "."),
  },
};

export default nextConfig;
