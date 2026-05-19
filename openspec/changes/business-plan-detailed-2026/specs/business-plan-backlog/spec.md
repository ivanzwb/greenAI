## Backlog 条目表（可导入 Issue）

具体行级优先级与 § 引用见 **[backlog-table.md](./backlog-table.md)**；下列 Requirement 为规则与场景契约。

## ADDED Requirements

### Requirement: Backlog 条目 SHALL 带优先级与来源章节

`business-plan-backlog` 规格中列出的每一条 backlog SHALL 包含 **优先级（P0/P1/P2）** 与 **计划书章节引用**（如 §5 商业模式、§7 实施计划），且 SHALL 可被独立勾选为「本季度不做」而不影响 v1.0 parity 的「已实现」判定。

#### Scenario: 条目可被导入 issue 跟踪

- **WHEN** 维护者将某 backlog 行复制到 GitHub Issue
- **THEN** 该行 SHALL 已含优先级与章节引用，无需再补计划书页码

---

### Requirement: P1 — 付费墙与识别/诊断次数（产品决策待定）

Backlog SHALL 包含「若上线计划书中的免费版次数限制与付费订阅，**SHALL** 先完成：支付方式、微信合规、与 MVP 无支付假设的差异分析」条目，状态为 **待产品决策**，在未决策前 **MUST NOT** 默认为已实现。

#### Scenario: 未决策前不修改 superpowers 计费契约

- **WHEN** 未出具书面产品决策
- **THEN** 工程 MUST NOT 将「每日 3 次识别」等限制写进 superpowers spec 的 MUST 条款

---

### Requirement: P1 — 多端 App（计划书 React Native）

Backlog SHALL 记录「计划书 §4.2 前端含 React Native；当前仓库仅微信小程序」为 **P1 渠道扩展**，依赖独立 change（非本 change 范围）。

#### Scenario: RN 不阻塞微信 MVP 发布

- **WHEN** 发布微信 MVP
- **THEN** RN 条目 SHALL 保持为 backlog 而不进入 v1.0 parity 的缺口

---

### Requirement: P2 — 计划书技术栈与生产目标（MySQL/Redis/Gateway）

Backlog SHALL 记录「计划书示例架构中的 MySQL、Redis、API Gateway 与当前 Postgres 单栈」为 **P2 规模化/运维演进**，若执行 **SHALL** 另起 migration change 与容量评估。

#### Scenario: 不对当前开发分支强制双写

- **WHEN** 日常功能开发
- **THEN** 维护者 MUST NOT 以本 backlog 为由要求同时维护 MySQL 与 Postgres

---

### Requirement: P2 — 「提醒分数」研究与产品文案对齐

Backlog SHALL 包含可选课题：「是否将 `reminderJob` + `careEngine` 的现有行为 **产品化表述** 为计划书中的动态提醒叙事，或开展小规模用户可感知的 A/B 文案/节奏实验」，优先级 **P2**。

#### Scenario: 工程实现不强制改名为分数模型

- **WHEN** 完成该课题前
- **THEN** 代码 MUST 保持以间隔与发送窗为权威实现；仅允许文档与运营话术调整

---

### Requirement: P2 — 社区、电商、B 端（计划书 v3）

Backlog SHALL 将 §3.1 v3.0 的社区/电商/B 端列为 **P2 或更远**，并标记 **依赖** 用户规模与合规评估。

#### Scenario: v1 sprint 不纳入社区开发

- **WHEN** 规划两周 sprint
- **THEN** 社区类 backlog SHALL 默认排除在范围外
