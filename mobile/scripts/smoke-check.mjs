import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const required = [
  "App.js",
  "src/api/mockClient.js",
  "src/data/knowledge.js",
  "src/theme/colors.js",
  "package.json",
  "app.json",
];

const missing = required.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  throw new Error(`Missing mobile files: ${missing.join(", ")}`);
}

const app = readFileSync(join(root, "App.js"), "utf8");
const mock = readFileSync(join(root, "src/api/mockClient.js"), "utf8");

for (const route of ["home", "identify", "discover", "plants", "plantEdit", "plan", "sensors", "diagnose", "article", "provision"]) {
  if (!app.includes(`"${route}"`)) {
    throw new Error(`Route not wired: ${route}`);
  }
}

for (const endpoint of ["/tasks/today", "/plants", "/weather/current", "/knowledge/articles", "/diagnose", "/soil/estimate-photo", "/devices"]) {
  if (!mock.includes(endpoint)) {
    throw new Error(`Mock endpoint missing: ${endpoint}`);
  }
}

console.log("greenAI mobile smoke-check passed");
