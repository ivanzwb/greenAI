## 1. 规格与变更闭环

- [x] 1.1 对照 `specs/business-plan-v1-parity/spec.md` 中的 API/模块路径，在仓库中做一次抽样打开确认（识别、土壤、天气、计划重算、提醒、诊断、知识库），路径过时则在本 change 内修正 spec 引用
- [x] 1.2 运行 `openspec validate business-plan-detailed-2026 --strict`（若 CLI 支持），无报错则视为本 change 的 OpenSpec 校验通过
- [x] 1.3 合并本 change 相关 PR 后，再次执行 `openspec status --change business-plan-detailed-2026`，确认 `isComplete` 为 true

## 2. 文档可发现性（可选但推荐）

- [x] 2.1 在 `docs/README.md` 的「文件索引」或「快速入口」增加一行：指向 `openspec/changes/business-plan-detailed-2026/proposal.md`（或整个 change 目录），说明为「详细计划书 ↔ 工程」对照入口
- [x] 2.2 在 `docs/product/项目计划书 - 详细.md` 文首「背景/修订记录」附近增加一句交叉引用：工程对齐以 `openspec/changes/business-plan-detailed-2026/` 为准、MVP 行为契约仍以 `docs/superpowers/specs/2026-05-18-wechat-mp-care-mvp-design.md` 为准（避免双源误解）

## 3. 开放问题与产品决策（记录即可，不强制改代码）

- [x] 3.1 将「免费版识别/诊断次数与付费墙」结论（做 / 不做 / 暂缓）写入 `design.md` 的 Open Questions 或 `docs/product/` 下独立备忘，并注明是否触发后续 billing 类 change
- [x] 3.2 将「专家咨询 vs 小程序客服入口」是否满足 v1.0 叙事写入同一处，便于商务材料统一口径

## 4. 后续维护约定

- [x] 4.1 在团队约定或本 change `design.md` 的 Risks 中确认：重大功能合并时，是否由该 feature 的 change 负责回写 `business-plan-v1-parity` 中对应行的实现状态（是/否二选一并执行一次示例 PR 或说明「由 release 前专人批量更新」）
