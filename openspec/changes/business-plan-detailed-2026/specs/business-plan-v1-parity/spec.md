## 实现对照表（Normative 详表）

各 Requirement 的场景条目中要求的 API/路径引用，以 **[parity-matrix.md](./parity-matrix.md)** 中的对照矩阵为准；本文件的 SHALL/Scenario 为契约条目，矩阵为便于评审的汇总视图。

## ADDED Requirements

### Requirement: 商业计划 v1.0 — 植物识别与仓库映射

本变更中的对照文档 SHALL 将计划书 **§3.1 v1.0** 行「植物识别」映射到仓库 **拍照识别 + 品种档案** 能力，并标注状态为 **已实现**，且 SHALL 列出主要 API 与数据落点。

#### Scenario: 映射包含百度识别与品种档案

- **WHEN** 读者查阅 `business-plan-v1-parity` 规格中本 Requirement 的对照表行
- **THEN** 该行 SHALL 引用 `POST /plants/identify`、`SpeciesProfile`、及 `docs/knowledge/` 下知识库设计文档中与识别回填相关的说明（路径以当时仓库为准）

---

### Requirement: 商业计划 v1.0 — 土壤识别与仓库映射

对照文档 SHALL 将计划书「土壤识别」映射到 **盆土拍照估干湿 / 土壤记录** 能力，并标注为 **已实现** 或 **部分实现**（以是否覆盖「肥力」等子能力为准）。

#### Scenario: 映射包含估测接口与记录表

- **WHEN** 读者查阅对照表
- **THEN** 该行 SHALL 引用 `POST /soil/estimate-photo`（或当前等价路径）、`SoilRecord` 模型、及小程序土壤入口页面路径

---

### Requirement: 商业计划 v1.0 — 环境感知与仓库映射

对照文档 SHALL 将计划书「环境感知」映射到 **用户经纬度/时区 + Open-Meteo 天气 + PlantEnv** 驱动的引擎输入，并 SHALL 标注与计划书「百度/心知天气」的差异为 **供应商不同、语义等价**。

#### Scenario: 天气供应商差异被显式记录

- **WHEN** 产品或工程对照计划书 §4.3.3 天气 API 描述
- **THEN** 对照表 SHALL 包含一行说明当前实现为 Open-Meteo 及缓存策略（见 `userWeather` / `careEngine` 相关代码路径）

---

### Requirement: 商业计划 v1.0 — 养护计划与仓库映射

对照文档 SHALL 将「个性化养护计划」映射到 **植物维度字段 + careEngine 间隔 + 任务生成与重算**，并标注 **已实现**。

#### Scenario: 映射包含计划重算入口

- **WHEN** 读者查阅对照表
- **THEN** 该行 SHALL 引用植物 CRUD、`plan/regenerate` 或等价路由、及 `careEngine` 模块路径

---

### Requirement: 商业计划 v1.0 — 智能提醒与仓库映射

对照文档 SHALL 将计划书「智能提醒」映射到 **CareTask + 订阅消息 + reminderJob 发送窗与推迟/提前规则**，并 SHALL 显式说明与计划书「提醒分数模型」的差异（间隔天 + 发送策略，而非逐任务连续分数）。

#### Scenario: 提醒模型差异被记录

- **WHEN** 架构评审引用计划书 §3.2.5–3.2.6 的公式化描述
- **THEN** 对照表 SHALL 指向 `reminderJob.ts` 中常量与分支说明，并给出一句「当前实现语义」摘要

---

### Requirement: 商业计划 v1.0 — 在线诊断与仓库映射

对照文档 SHALL 将「在线诊断」映射到 **规则诊断目录 + POST /diagnose + 可选 LLM 视觉诊断**，并标注 **已实现**（含免责声明与额度约束的说明引用）。

#### Scenario: 映射包含规则与 LLM 双路径

- **WHEN** 读者查阅对照表
- **THEN** 该行 SHALL 引用 `diagnoseEngine`、`POST /diagnose`、`POST /diagnose/llm` 及小程序诊断页路径

---

### Requirement: 商业计划 v1.0 — 知识库与仓库映射

对照文档 SHALL 将「知识库」映射到 **KnowledgeArticle + 搜索 + 症状/品种标签 + 小程序发现/详情**，并标注 **已实现**（含 DB/静态回退策略）。

#### Scenario: 映射包含搜索与诊断延伸阅读

- **WHEN** 读者查阅对照表
- **THEN** 该行 SHALL 引用 `GET /knowledge/search`、种子与 `docs/knowledge/` 设计文档路径

---

### Requirement: 商业计划 v1.0 — 硬件与 v2+ 能力标注为不适用

对照文档 SHALL 将计划书 **§3.1 v2.0/v3.0** 及硬件相关能力在 v1.0 对照中统一标注为 **不适用（当前仓库范围外）**，且 SHALL NOT 将其标为「未实现」以免与软件缺口混淆。

#### Scenario: v2 智能花盆不进入 v1 缺口统计

- **WHEN** 读者筛选「未实现」项做 sprint
- **THEN** 硬件类条目 SHALL 不出现在 v1.0 软件缺口列表中
