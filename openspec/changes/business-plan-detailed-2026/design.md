## Context

- **来源文档**：`docs/product/项目计划书 - 详细.md`（以下简称「计划书」）描述 v1.0～v3.0 产品与技术愿景；其中 **§3.1 v1.0** 为与当前 **greenAI** 仓库最接近的对照面。
- **当前仓库**：微信小程序 + **Fastify + Prisma + PostgreSQL**；天气 **Open-Meteo**；植物识别 **百度**；视觉诊断与盆土估测 **OpenAI 兼容 LLM**；养护与提醒见 `backend/src/domain/careEngine.ts`、`backend/src/services/reminderJob.ts` 等。
- **已有工程规格**：`docs/superpowers/specs/2026-05-18-wechat-mp-care-mvp-design.md` 为 MVP A 行为契约；本 change **补充**商业计划视角的对照与 backlog，**不替代** superpowers spec。

## Goals / Non-Goals

**Goals:**

- 在 `specs/business-plan-v1-parity` 中给出 **v1.0 七模块** 与 **具体路由/页面/引擎** 的映射及 **实现状态**（已实现 / 部分 / 未实现 / 不适用）。
- 在 `specs/business-plan-backlog` 中列出与 **v1.0 软件** 相关、但 **尚未在仓库闭环** 或 **与计划书表述不一致需产品决策** 的条目，便于排期。
- 在本文档中固化 **技术栈差异**（计划书中的 MySQL/Redis/百度天气/「提醒分数」等）的 **推荐解读**，减少评审误解。

**Non-Goals:**

- 不在本 design 中规定 **硬件、电商、社区、RN App** 的落地方案。
- 不要求将计划书全文搬进仓库或替换 `docs/superpowers` 正文。

## Decisions

| 决策 | 说明 |
|------|------|
| **D1 — 单一工程真相源** | 运行行为以 **代码 + superpowers MVP spec** 为准；计划书为 **商业叙事**；本 change 的 parity 表为 **解释层**，冲突时以 superpowers + 代码为准。 |
| **D2 — 天气数据源** | 计划书写百度/心知天气；仓库采用 **Open-Meteo**（无密钥、与 `careEngine` 一致）。Parity 表标注为 **「实现等价，供应商不同」**。 |
| **D3 — 提醒模型** | 计划书 §3.2.5/3.2.6 的「提醒分数」为 **概念模型**；仓库为 **间隔天 + 订阅发送窗（临近 15 分钟 + 干旱提前至多 6 小时等）**。不强制改名代码以迎合计划书措辞；在 parity 中 **显式对照**。 |
| **D4 — 数据层** | 计划书示例为 MySQL；仓库为 **PostgreSQL**。不在 v1.0 对齐范围内做数据库迁移。 |
| **D5 — OpenSpec 粒度** | 本 change 产出 **两条能力规格**（`business-plan-v1-parity`、`business-plan-backlog`），避免单文件过大；后续大功能仍应 **新建 change**。 |

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| Parity 表随代码迭代过时 | **约定（2026-05）**：合并 **影响 §3.1 v1.0 七模块映射** 的功能时，由该 feature 的 PR **在同一合并窗口内** 更新 `specs/business-plan-v1-parity/spec.md` 中的路径或状态表述（或跟进的 docs-only PR，不晚于下一次 release tag）。未触及该映射的改动可跳过。若某次发布未声明 parity 更新，**发布负责人**在打 tag 前做一次「抽样路径仍有效」核对。 |
| 产品方仍以计划书技术栈为准 | 在对外材料中引用 **本 change design 的 D2–D4** 一节或 `writing-standard` 中的「代码即真相」说明。 |
| Backlog 过长导致无法排期 | backlog 规格中 **MUST** 带优先级字段（P0/P1/P2）与依赖（可选）；每季度裁剪。 |

## Migration Plan

- 无数据迁移。合并本 change 后：可选将 `openspec/changes/business-plan-detailed-2026/` 的 **摘要链接** 加入 `docs/README.md` 文件索引表（由 `tasks.md` 驱动）。

## Open Questions

以下条目在 **未出具书面产品决策** 前，工程侧 **默认「暂缓 / 不纳入 MVP 契约」**；不得将计划书中的次数或付费条款写进 `docs/superpowers` 的 MUST 行为条款。

- **免费版识别 / 诊断次数与付费墙（§5 等）**  
  - **当前结论（工程默认）**：**暂缓**。仓库为无支付 MVP；额度与计费若上线，须先经微信合规与支付方式评估，再 **另起 OpenSpec billing 类 change**（或等价流程），并同步 superpowers。  
  - **触发条件**：产品书面确认「做 / 不做 / 分阶段」后，更新本段「当前结论」并链接至该 change 或 `docs/product/` 备忘。

- **「专家咨询」vs 小程序客服入口**  
  - **当前结论（工程默认）**：**v1.0 以小程序内置客服入口作为「轻咨询」渠道**；与计划书中「专家咨询」的完整叙事 **不等价**，商务材料中宜表述为「客服 / 轻咨询」或待产品统一话术后再对外称「专家」。  
  - **触发条件**：若上线独立专家入口（页面、派单、付费），另起 change 并回写本段。
