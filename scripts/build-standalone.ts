#!/usr/bin/env node
/**
 * Build standalone executables for Deck (server + agent).
 * Uses esbuild to bundle + Node.js to run.
 * Output: dist/deck-server.mjs and dist/deck-agent.mjs
 * Run with: node dist/deck-server.mjs
 */
import { execSync } from "node:child_process";
import { mkdirSync, cpSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");

console.log("[build] Creating standalone bundles...\n");

mkdirSync(dist, { recursive: true });

// Bundle server
execSync(
  `npx esbuild apps/server/src/index.ts --bundle --platform=node --format=esm --outfile=dist/deck-server.mjs --external:express --external:socket.io --external:cors`,
  { stdio: "inherit", cwd: root }
);

// Bundle agent
execSync(
  `npx esbuild apps/agent/src/index.ts --bundle --platform=node --format=esm --outfile=dist/deck-agent.mjs --external:socket.io-client`,
  { stdio: "inherit", cwd: root }
);

// Copy public folder
cpSync(resolve(root, "apps/server/public"), resolve(dist, "public"), { recursive: true });

// Copy config
cpSync(resolve(root, "deck.config.json"), resolve(dist, "deck.config.json"));

console.log("\n[build] Done! Files in dist/");
console.log("  → dist/deck-server.mjs  (run with: node deck-server.mjs)");
console.log("  → dist/deck-agent.mjs   (run with: node deck-agent.mjs)");
console.log("  → dist/public/          (UI files)");
console.log("  → dist/deck.config.json (your config)");
console.log("\nTo run: cd dist && node deck-server.mjs & node deck-agent.mjs");
