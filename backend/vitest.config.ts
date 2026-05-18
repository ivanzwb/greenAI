import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const loaded = loadEnv(mode, root, "");
  for (const [key, val] of Object.entries(loaded)) {
    if (process.env[key] === undefined && val !== "") {
      process.env[key] = val;
    }
  }

  return {
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
