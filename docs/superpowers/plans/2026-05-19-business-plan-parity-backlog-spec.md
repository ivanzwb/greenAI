# 商业计划 v1.0 Parity + Backlog 规格落地 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 满足 OpenSpec 变更 `business-plan-detailed-2026` 中 `business-plan-v1-parity` 与 `business-plan-backlog` 两条能力规格：在仓库内提供 **可读的 v1.0 七模块对照表**（含 API、引擎、小程序路径、状态与「不适用」边界），以及 **可复制到 Issue 的 backlog 表**（每条含 P0/P1/P2 与计划书章节引用）；不修改 MVP 行为契约正文（`docs/superpowers/specs/2026-05-18-wechat-mp-care-mvp-design.md`）中的 MUST 条款。

**Architecture:** 对照与 backlog 以 **Markdown 数据面** 落在 `openspec/changes/business-plan-detailed-2026/specs/` 下，与现有 **Requirements 风格** 的 `spec.md` 并存：`spec.md` 保留 SHALL/Scenario 契约；新增 `parity-matrix.md` 与 `backlog-table.md` 承载「人类可读矩阵」。权威行为仍以 **代码 + superpowers MVP design** 为准（见 change 内 `design.md` D1）。

**Tech Stack:** Markdown、OpenSpec CLI（`openspec validate`）；无新增运行时依赖。

**Spec references:**

- `openspec/changes/business-plan-detailed-2026/specs/business-plan-v1-parity/spec.md`
- `openspec/changes/business-plan-detailed-2026/specs/business-plan-backlog/spec.md`
- `openspec/changes/business-plan-detailed-2026/design.md`

---

## File structure

| Path | Responsibility |
|------|----------------|
| `openspec/changes/business-plan-detailed-2026/specs/business-plan-v1-parity/parity-matrix.md` | **新增**：§3.1 v1.0 七模块 + v2/v3「不适用」行的完整对照表（满足各 Requirement 的 THEN 引用） |
| `openspec/changes/business-plan-detailed-2026/specs/business-plan-v1-parity/spec.md` | **修改**：文首或文末增加一行指向 `parity-matrix.md`，避免读者只读 Requirements 找不到表 |
| `openspec/changes/business-plan-detailed-2026/specs/business-plan-backlog/backlog-table.md` | **新增**：带优先级与 § 引用的 backlog 行，满足「复制到 Issue」场景 |
| `openspec/changes/business-plan-detailed-2026/specs/business-plan-backlog/spec.md` | **可选修改**：文首增加指向 `backlog-table.md` 的链接 |
| `docs/README.md` | **可选修改**：文件索引增加本计划路径，便于从文档中心进入 |

---

### Task 1: 新增 v1.0 Parity 对照表文件

**Files:**

- Create: `openspec/changes/business-plan-detailed-2026/specs/business-plan-v1-parity/parity-matrix.md`
- Reference: `backend/src/routes/plants.ts`（`/plants/identify`）
- Reference: `backend/prisma/schema.prisma`（`SpeciesProfile`、`SoilRecord`、`KnowledgeArticle`）
- Reference: `miniprogram/pages/plant-edit/plant-edit.js`（`/soil/estimate-photo` 调用）

- [ ] **Step 1: 新建 `parity-matrix.md` 并写入下表全文**

创建文件 `openspec/changes/business-plan-detailed-2026/specs/business-plan-v1-parity/parity-matrix.md`，内容如下（可根据合并当日代码微调路径，但须与下表语义一致）：

```markdown
# 商业计划书 §3.1 v1.0 ↔ 仓库对照矩阵

> 状态取值：`已实现` | `部分实现` | `不适用`（v2/v3/硬件）。**不**使用「未实现」描述硬件能力，以免与软件缺口混淆。

| 计划书 v1.0 能力 | 状态 | 主要 API / 模块 / 数据 | 小程序入口 | 与计划书差异说明 |
|------------------|------|-------------------------|------------|------------------|
| 植物识别 | 已实现 | `POST /plants/identify`（`backend/src/routes/plants.ts`）；百度适配 `backend/src/services/baiduPlantIdentify.ts`；品种档案 `SpeciesProfile`（`backend/prisma/schema.prisma`）；LLM 档案 `backend/src/services/speciesProfileLlm.ts` | 植物新建/编辑 `miniprogram/pages/plant-edit/plant-edit`（识别流程） | 知识库回填与品种关联见 `docs/knowledge/knowledge-base-layered-search-design.md` |
| 土壤识别 | 部分实现 | `POST /soil/estimate-photo`（`backend/src/routes/soilEstimate.ts`）；`SoilRecord`；估测 `backend/src/services/soilPhotoLlm.ts`；`GET /plants/:id/soil-records` | 同上 `plant-edit`（盆土拍照与自评） | 干湿 + LLM 肥力提示；「肥力」以提示为主，非实验室测定 → 标 **部分实现** |
| 环境感知 | 已实现 | 用户经纬度/时区：`backend/src/routes/users.ts` 等；天气快照 `backend/src/lib/userWeather.ts` + `backend/src/services/openMeteo.ts`；引擎输入 `backend/src/domain/careEngine.ts`（`PlantEnv` / 天气系数） | `miniprogram/pages/settings/settings` | 计划书 §4.3.3 百度/心知天气 → 仓库 **Open-Meteo**，语义等价、供应商不同（见 change `design.md` D2） |
| 个性化养护计划 | 已实现 | 植物 CRUD `backend/src/routes/plants.ts`；`POST /plants/:id/plan/regenerate`；纯引擎 `backend/src/domain/careEngine.ts` | `miniprogram/pages/plant-edit/plant-edit`、`miniprogram/pages/plant-plan/plant-plan` | — |
| 智能提醒 | 已实现 | `CareTask` 与任务路由 `backend/src/routes/tasks.ts`；订阅上报 `backend/src/routes/subscribe.ts`；发送窗与提前/推迟 `backend/src/services/reminderJob.ts`（如 `SOON_MS`、`EARLY_WATER_HORIZON_MS`、干湿阈值分支） | `miniprogram/pages/index/index`（今日任务与订阅引导） | 计划书 §3.2.5–3.2.6「提醒分数」为概念模型；仓库权威为 **间隔天 + 发送窗 + 天气/盆土分支**（见 `design.md` D3） |
| 在线诊断 | 已实现 | 规则引擎 `backend/src/domain/diagnoseEngine.ts`；`GET /diagnose/catalog`、`POST /diagnose`、`POST /diagnose/llm`（`backend/src/routes/diagnose.ts`）；视觉 `backend/src/services/diagnoseLlm.ts` | `miniprogram/pages/diagnose/diagnose` | 免责声明与 LLM 开关见 `backend/src/config.ts` 注释及路由 503 分支 |
| 知识库 | 已实现 | `GET /knowledge/search`（`backend/src/routes/knowledge.ts`）；`KnowledgeArticle`；搜索服务 `backend/src/services/knowledgeSearchService.ts` | `miniprogram/pages/discover/discover`、`miniprogram/pages/discover-detail/discover-detail` | 分层与回退见 `docs/knowledge/knowledge-base-layered-search-design.md`、`knowledge-base-data-sourcing.md` |
| §3.1 v2.0 / v3.0 及硬件（智能花盆等） | 不适用 | — | — | 不纳入 v1.0 软件缺口统计（Requirement: 硬件与 v2+） |
```

- [ ] **Step 2: 对照仓库快速校验路径**

在仓库根目录执行：

```bash
rg "/plants/identify" backend/src/routes/plants.ts
rg "estimate-photo" backend/src/routes/soilEstimate.ts
rg "plan/regenerate" backend/src/routes/plants.ts
```

Expected: 每行至少一处匹配；若不匹配，先改 `parity-matrix.md` 中的路径再进入下一步。

- [ ] **Step 3: 提交（若本批次需入库）**

```bash
git add openspec/changes/business-plan-detailed-2026/specs/business-plan-v1-parity/parity-matrix.md
git commit -m "docs(openspec): add business plan v1.0 parity matrix"
```

---

### Task 2: 在 `business-plan-v1-parity/spec.md` 中链接对照表

**Files:**

- Modify: `openspec/changes/business-plan-detailed-2026/specs/business-plan-v1-parity/spec.md`（在 `## ADDED Requirements` 之前插入简短导航段）

- [ ] **Step 1: 在文件顶部加入指向矩阵的段落**

在首行 `## ADDED Requirements` **之上**插入：

```markdown
## 实现对照表（Normative 详表）

各 Requirement 的场景条目中要求的 API/路径引用，以 **[parity-matrix.md](./parity-matrix.md)** 中的对照矩阵为准；本文件的 SHALL/Scenario 为契约条目，矩阵为便于评审的汇总视图。

```

- [ ] **Step 2: 提交**

```bash
git add openspec/changes/business-plan-detailed-2026/specs/business-plan-v1-parity/spec.md
git commit -m "docs(openspec): link v1 parity spec to parity matrix"
```

---

### Task 3: 新增 Backlog 导出表

**Files:**

- Create: `openspec/changes/business-plan-detailed-2026/specs/business-plan-backlog/backlog-table.md`

- [ ] **Step 1: 创建 `backlog-table.md` 并写入下表**

```markdown
# 商业计划相关 Backlog（可导入 Issue）

> 每条均含 **优先级** 与 **计划书章节**，满足 `business-plan-backlog` 规格。`本季度不做` 可在 Issue 中打 label，不改变 v1.0 parity 的「已实现」判定。

| ID | 优先级 | 计划书章节 | 标题 | 说明 / 依赖 |
|----|--------|------------|------|-------------|
| BL-01 | P1 | §5 商业模式；§七 实施计划 | 付费墙与识别/诊断次数 | 上线前须：支付方式、微信合规、与当前无支付 MVP 的差异分析；**待书面产品决策**；未决策前不得写入 superpowers MUST 计费条款 |
| BL-02 | P1 | §4.2 技术方案（前端含 React Native） | 多端 App（RN） | 当前仅微信小程序；独立 change；不阻塞微信 MVP |
| BL-03 | P2 | §4 技术方案（示例架构 MySQL/Redis/Gateway） | 规模化数据层与网关 | Postgres 单栈现状；若执行须另起 migration change + 容量评估；日常开发不强制双写 |
| BL-04 | P2 | §3.2.5–3.2.6 提醒模型叙事 | 提醒「分数」与产品文案 / 轻量实验 | 代码权威仍为 `careEngine` + `reminderJob` 间隔与发送窗；仅允许文档与运营话术或小规模 A/B，不强制改名为分数模型 |
| BL-05 | P2 | §3.1 v3.0；§十一下一步行动 | 社区 / 电商 / B 端 | 依赖用户规模与合规评估；两周 sprint 默认排除 |
```

- [ ] **Step 2: 提交**

```bash
git add openspec/changes/business-plan-detailed-2026/specs/business-plan-backlog/backlog-table.md
git commit -m "docs(openspec): add business plan backlog export table"
```

---

### Task 4: 在 `business-plan-backlog/spec.md` 中链接导出表

**Files:**

- Modify: `openspec/changes/business-plan-detailed-2026/specs/business-plan-backlog/spec.md`

- [ ] **Step 1: 在 `## ADDED Requirements` 之前插入**

```markdown
## Backlog 条目表（可导入 Issue）

具体行级优先级与 § 引用见 **[backlog-table.md](./backlog-table.md)**；下列 Requirement 为规则与场景契约。

```

- [ ] **Step 2: 提交**

```bash
git add openspec/changes/business-plan-detailed-2026/specs/business-plan-backlog/spec.md
git commit -m "docs(openspec): link backlog spec to export table"
```

---

### Task 5: OpenSpec 校验与文档索引

**Files:**

- Modify（可选）: `docs/README.md`（在「文件索引」表增加一行指向本计划）

- [ ] **Step 1: 运行 OpenSpec 严格校验**

```bash
openspec validate business-plan-detailed-2026 --strict
```

Expected: `Change 'business-plan-detailed-2026' is valid`

- [ ] **Step 2（可选）: 更新 `docs/README.md`**

在「文件索引」表增加一行（路径按仓库实际）：

```markdown
| [superpowers/plans/2026-05-19-business-plan-parity-backlog-spec.md](./superpowers/plans/2026-05-19-business-plan-parity-backlog-spec.md) | 计划 | 商业计划 parity + backlog 规格落地步骤 |
```

- [ ] **Step 3: 提交**

```bash
git add docs/README.md
git commit -m "docs: index business plan parity backlog implementation plan"
```

（若跳过 Step 2，则仅 `git add` 为空时可不提交。）

---

### Task 6: 文档锚点自动化（CI + 本地）

**Files:**

- Create: `scripts/parity-docs-anchor.test.mjs`（`node:test`，断言 `parity-matrix.md` / `backlog-table.md` 关键子串及两条 `spec.md` 的导航链接）
- Modify: `package.json`（`verify:openspec-docs`）
- Modify: `.github/workflows/ci.yml`（`openspec-docs` job，并纳入 `ci-success`）

- [x] **Step 1: 运行本地校验**

```bash
npm run verify:openspec-docs
```

Expected: 4 tests pass（`node --test` TAP 输出无 fail）。

- [x] **Step 2: 与后端验证一并跑（合并前）**

```bash
npm run verify:openspec-docs && npm run verify:backend
```

---

## Self-review（对照规格）

1. **Spec coverage**
   - v1 七模块 + API/引擎/小程序/knowledge 文档引用 → **Task 1** 矩阵行覆盖。
   - 天气供应商差异、提醒模型差异 → 矩阵「差异说明」列。
   - 硬件 v2/v3「不适用」→ 矩阵最后一行。
   - Backlog 带 P0/P1/P2 与章节、付费/RN/MySQL/提醒文案/社区 → **Task 3** 表行覆盖；P0 在表中可用「（保留）」——当前 backlog 规格未列 P0 具体项，表中以 BL-01～05 覆盖规格所列 P1/P2；若后续产品新增 P0，在 `backlog-table.md` 追加行即可。
2. **Placeholder scan**：本计划无 TBD/TODO 式步骤；矩阵正文已内嵌。
3. **Consistency**：路由前缀与 `plants.ts`/`soilEstimate.ts`/`diagnose.ts` 一致；小程序路径与 `miniprogram/app.json` 的 `pages/*` 一致。

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-19-business-plan-parity-backlog-spec.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — 每个 Task 派生子代理，任务间人工复核；须配合 **superpowers:subagent-driven-development**。

**2. Inline Execution** — 本会话或单会话按 Task 顺序执行；须配合 **superpowers:executing-plans** 与检查点。

**Which approach?**
