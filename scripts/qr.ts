import { networkInterfaces } from "node:os";
import qrcode from "qrcode-terminal";

const PORT = 3100;

function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

const ip = getLocalIP();
const url = `http://${ip}:${PORT}`;

console.log("\n");
console.log("  ┌─────────────────────────────────────┐");
console.log("  │         📱 OPEN DECK                 │");
console.log("  │   Scan with your phone or tablet:    │");
console.log("  └─────────────────────────────────────┘");
console.log("");
qrcode.generate(url, { small: true });
console.log(`\n  → ${url}\n`);
