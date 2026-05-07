import { networkInterfaces } from "node:os";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import qrcode from "qrcode-terminal";

const PORT = 4000;

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  try {
    return execSync("ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}'", { encoding: "utf-8" }).trim();
  } catch {
    return "localhost";
  }
}

const ip = getLocalIP();
const url = `http://${ip}:${PORT}`;

// Auto-generate .env.local so the tablet connects to the right server
writeFileSync(resolve(process.cwd(), "apps/web/.env.local"), `NEXT_PUBLIC_SERVER_URL=http://${ip}:4000\n`);

console.log("\n");
console.log("  ┌─────────────────────────────────────┐");
console.log("  │         📱 OPEN DECK                 │");
console.log("  │   Scan with your phone or tablet:    │");
console.log("  └─────────────────────────────────────┘");
console.log("");
qrcode.generate(url, { small: true });
console.log(`\n  → ${url}\n`);
