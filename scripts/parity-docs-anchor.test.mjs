/**
 * 锁定 OpenSpec `business-plan-detailed-2026` 下 parity / backlog 文档的关键锚点，
 * 防止对照表与 spec 导航链接在编辑中被误删。
 * 运行：node --test scripts/parity-docs-anchor.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const parityMatrix = join(
  root,
  "openspec/changes/business-plan-detailed-2026/specs/business-plan-v1-parity/parity-matrix.md"
);
const paritySpec = join(
  root,
  "openspec/changes/business-plan-detailed-2026/specs/business-plan-v1-parity/spec.md"
);
const backlogTable = join(
  root,
  "openspec/changes/business-plan-detailed-2026/specs/business-plan-backlog/backlog-table.md"
);
const backlogSpec = join(
  root,
  "openspec/changes/business-plan-detailed-2026/specs/business-plan-backlog/spec.md"
);

function mustContain(filePath, substrings, label) {
  const text = readFileSync(filePath, "utf8");
  for (const s of substrings) {
    assert.ok(
      text.includes(s),
      `${label}: missing ${JSON.stringify(s)} in ${filePath}`
    );
  }
}

test("miniprogram plant-plan shows soil summary", () => {
  const jsPath = join(root, "miniprogram/pages/plant-plan/plant-plan.js");
  const text = readFileSync(jsPath, "utf8");
  assert.ok(
    text.includes("loadSoilSummary"),
    "plant-plan must load soil summary"
  );
  assert.ok(
    text.includes("/soil-records"),
    "plant-plan must call soil-records API"
  );
});

test("miniprogram plant-edit loads soil-records API", () => {
  const jsPath = join(
    root,
    "miniprogram/pages/plant-edit/plant-edit.js"
  );
  const text = readFileSync(jsPath, "utf8");
  assert.ok(
    text.includes("/soil-records"),
    "plant-edit must call GET /plants/:id/soil-records"
  );
  assert.ok(
    text.includes("loadSoilRecords"),
    "plant-edit must define loadSoilRecords"
  );
});

test("parity-matrix.md has v1.0 API and module anchors", () => {
  mustContain(
    parityMatrix,
    [
      "POST /plants/identify",
      "POST /soil/estimate-photo",
      "/plants/:id/plan/regenerate",
      "backend/src/lib/userWeather.ts",
      "backend/src/services/reminderJob.ts",
      "POST /diagnose/llm",
      "GET /knowledge/search",
      "不适用",
    ],
    "parity-matrix"
  );
});

test("business-plan-v1-parity spec links to parity-matrix.md", () => {
  const text = readFileSync(paritySpec, "utf8");
  assert.ok(
    text.includes("[parity-matrix.md](./parity-matrix.md)"),
    "v1-parity spec must link to parity matrix"
  );
});

test("backlog-table.md has issue-ready rows and section refs", () => {
  mustContain(
    backlogTable,
    ["BL-01", "BL-05", "| P1 |", "| P2 |", "§5", "§3.1 v3.0"],
    "backlog-table"
  );
});

test("business-plan-backlog spec links to backlog-table.md", () => {
  const text = readFileSync(backlogSpec, "utf8");
  assert.ok(
    text.includes("[backlog-table.md](./backlog-table.md)"),
    "backlog spec must link to backlog table"
  );
});
