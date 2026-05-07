import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@open-deck/shared"],
  turbopack: {
    root: "../..",
  },
};

export default config;
