/**
 * Writes minimal 1×1 PNGs for uni-app tabBar until design assets are added.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dir = path.join(root, "uniapp", "src", "static", "tab");
const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const names = [
  "home.png",
  "home-active.png",
  "care.png",
  "care-active.png",
  "knowledge.png",
  "knowledge-active.png",
  "me.png",
  "me-active.png",
];

fs.mkdirSync(dir, { recursive: true });
for (const f of names) {
  fs.writeFileSync(path.join(dir, f), png1x1);
}
console.log("OK", dir);
