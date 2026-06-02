/**
 * Rasterize miniprogram/images/icons-src/*.svg → miniprogram/images/icons-png/*.png
 * Requires: npm install (sharp in repo devDependencies)
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const srcDir = join(root, "miniprogram", "images", "icons-src");
const outDir = join(root, "miniprogram", "images", "icons-png");
mkdirSync(outDir, { recursive: true });

/** [input.svg, output.png, edge px] */
const jobs = [
  ["tab-home-unselected.svg", "tab-home-unselected.png", 81],
  ["tab-home-selected.svg", "tab-home-selected.png", 81],
  ["tab-care-unselected.svg", "tab-care-unselected.png", 81],
  ["tab-care-selected.svg", "tab-care-selected.png", 81],
  ["tab-knowledge-unselected.svg", "tab-knowledge-unselected.png", 81],
  ["tab-knowledge-selected.svg", "tab-knowledge-selected.png", 81],
  ["tab-me-unselected.svg", "tab-me-unselected.png", 81],
  ["tab-me-selected.svg", "tab-me-selected.png", 81],
  ["home-weather-sun.svg", "home-weather-sun.png", 128],
  ["home-weather-earth.svg", "home-weather-earth.png", 128],
  ["home-todo-water.svg", "home-todo-water.png", 96],
  ["home-todo-fertilize.svg", "home-todo-fertilize.png", 96],
  ["home-tool-identify.svg", "home-tool-identify.png", 120],
  ["home-tool-soil.svg", "home-tool-soil.png", 120],
  ["home-tool-pest.svg", "home-tool-pest.png", 120],
];

for (const [svgName, pngName, size] of jobs) {
  const svgPath = join(srcDir, svgName);
  const buf = readFileSync(svgPath);
  await sharp(buf, { density: 300 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(join(outDir, pngName));
  console.log("OK", pngName, size);
}
