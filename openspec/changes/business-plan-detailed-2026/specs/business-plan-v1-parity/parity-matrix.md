# 商业计划书 §3.1 v1.0 ↔ 仓库对照矩阵

> 状态取值：`已实现` | `部分实现` | `不适用`（v2/v3/硬件）。**不**使用「未实现」描述硬件能力，以免与软件缺口混淆。

| 计划书 v1.0 能力 | 状态 | 主要 API / 模块 / 数据 | 小程序入口 | 与计划书差异说明 |
|------------------|------|-------------------------|------------|------------------|
| 植物识别 | 已实现 | `POST /plants/identify`（`backend/src/routes/plants.ts`）；百度适配 `backend/src/services/baiduPlantIdentify.ts`；品种档案 `SpeciesProfile`（`backend/prisma/schema.prisma`）；LLM 档案 `backend/src/services/speciesProfileLlm.ts` | 植物新建/编辑 `miniprogram/pages/plant-edit/plant-edit`（识别流程） | 知识库回填与品种关联见 `docs/knowledge/knowledge-base-layered-search-design.md` |
| 土壤识别 | 部分实现 | `POST /soil/estimate-photo`（`backend/src/routes/soilEstimate.ts`）；`SoilRecord`；估测 `backend/src/services/soilPhotoLlm.ts`；`GET /plants/:id/soil-records` | `plant-edit`：盆土自评 + 拍照估算；**编辑模式下拉取并展示** `GET /plants/:id/soil-records` 最近记录 | 干湿 + LLM 肥力提示；「肥力」以提示为主，非实验室测定 → 标 **部分实现** |
| 环境感知 | 已实现 | 用户经纬度/时区：`backend/src/routes/users.ts` 等；天气快照 `backend/src/lib/userWeather.ts` + `backend/src/services/openMeteo.ts`；引擎输入 `backend/src/domain/careEngine.ts`（`PlantEnv` / 天气系数） | `miniprogram/pages/settings/settings` | 计划书 §4.3.3 百度/心知天气 → 仓库 **Open-Meteo**，语义等价、供应商不同（见 change `design.md` D2） |
| 个性化养护计划 | 已实现 | 植物 CRUD `backend/src/routes/plants.ts`；`POST /plants/:id/plan/regenerate`；纯引擎 `backend/src/domain/careEngine.ts` | `miniprogram/pages/plant-edit/plant-edit`、`miniprogram/pages/plant-plan/plant-plan`（**计划页展示盆土摘要**：`GET /plants/:id` + `GET /plants/:id/soil-records`） | — |
| 智能提醒 | 已实现 | `CareTask` 与任务路由 `backend/src/routes/tasks.ts`；订阅上报 `backend/src/routes/subscribe.ts`；发送窗与提前/推迟 `backend/src/services/reminderJob.ts`（如 `SOON_MS`、`EARLY_WATER_HORIZON_MS`、干湿阈值分支） | `miniprogram/pages/index/index`（今日任务与订阅引导） | 计划书 §3.2.5–3.2.6「提醒分数」为概念模型；仓库权威为 **间隔天 + 发送窗 + 天气/盆土分支**（见 `design.md` D3） |
| 在线诊断 | 已实现 | 规则引擎 `backend/src/domain/diagnoseEngine.ts`；`GET /diagnose/catalog`、`POST /diagnose`、`POST /diagnose/llm`（`backend/src/routes/diagnose.ts`）；视觉 `backend/src/services/diagnoseLlm.ts` | `miniprogram/pages/diagnose/diagnose` | 免责声明与 LLM 开关见 `backend/src/config.ts` 注释及路由 503 分支 |
| 知识库 | 已实现 | `GET /knowledge/search`（`backend/src/routes/knowledge.ts`）；`KnowledgeArticle`；搜索服务 `backend/src/services/knowledgeSearchService.ts` | `miniprogram/pages/discover/discover`、`miniprogram/pages/discover-detail/discover-detail` | 分层与回退见 `docs/knowledge/knowledge-base-layered-search-design.md`、`knowledge-base-data-sourcing.md` |
| §3.1 v2.0 / v3.0 及硬件（智能花盆等） | 不适用 | — | — | 不纳入 v1.0 软件缺口统计（Requirement: 硬件与 v2+） |
