## Why

《植物管家 — 智能植物养护产品商业计划书（详细版）》（`docs/product/项目计划书 - 详细.md`）定义了 **v1.0 纯软件验证** 的功能矩阵、技术路线与实施节奏，但篇幅长、部分技术栈表述与当前仓库（微信小程序 + Fastify + Prisma/PostgreSQL）不一致。需要在工程侧建立 **可追溯的对照与分阶段增量清单**，避免「计划书」与「仓库真相」长期漂移，并为后续迭代提供统一的 OpenSpec 入口。

## What Changes

- 新增 OpenSpec 变更 **`business-plan-detailed-2026`**，沉淀 **v1.0 能力 ↔ 实现** 的对照规格与 **计划内未闭环** 的 backlog 规格（本变更以 **文档与需求条目** 为主，不强制在同一 PR 内完成全部实现）。
- 在 `design.md` 中明确：**当前仓库 MVP 边界**、与计划书中 **MySQL/Redis/提醒分数模型** 等表述的差异及推荐解读。
- 在 `tasks.md` 中列出可执行的后续任务（含可选：将对照表同步回 `docs/product/` 或 `docs/README.md` 索引）。

**非目标（本变更不包含）**

- 不引入计划书中的 **硬件 / v2+** 能力为当前 sprint 交付物。
- 不做 **MySQL 迁移** 或 **提醒分数模型** 的全量重写；仅在规格中标注与现有「间隔 + 订阅发送窗」实现的关系。

## Capabilities

### New Capabilities

- `business-plan-v1-parity`：《详细计划书》**§3.1 v1.0 功能表**与当前 **API / 小程序页面 / 引擎** 的对照矩阵；每条标注 **已实现 / 部分实现 / 未实现 / 不适用（如硬件）**，并引用计划书章节号。
- `business-plan-backlog`：从 **§七实施计划、§十一下一步行动** 等抽取的、与 **v1.0 软件范围** 相关的工程 backlog（可排序、可依赖标注），排除已完全由 `docs/superpowers` MVP 覆盖且已落地的条目重复描述。

### Modified Capabilities

- （无）`openspec/specs/` 下当前无既有能力包；与微信 MVP 的权威规格仍以 `docs/superpowers/specs/2026-05-18-wechat-mp-care-mvp-design.md` 为准，本变更 **不修改** 该文件行为契约。

## Impact

- **文档**：`openspec/changes/business-plan-detailed-2026/` 下新增 `proposal.md`、`design.md`、`specs/**`、`tasks.md`。
- **代码**：本变更阶段 **零代码**；后续 `/opsx:apply` 按 `tasks.md` 可能涉及小范围文档或产品索引更新。
- **协作**：产品/商务仍以 `docs/product/项目计划书 - 详细.md` 为原文；工程对齐以本 change 的 **specs** 为增量真相源。
