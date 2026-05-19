# 文档中心

本目录与代码同步，用于 **范围、部署、设计与协作对齐**。实现细节以源码与测试为准。

**写作结构与内容要求**见 **[文档写作规范](./writing-standard.md)**（目录约定、章节模板、排版与禁止事项）。

---

## 1. 目录用途（新文档请归入对应类）

| 目录 | 用途 |
|------|------|
| [engineering/](engineering/) | 部署、运维、环境变量 |
| [product/](product/) | 商业/产品备忘（非接口契约） |
| [knowledge/](knowledge/) | 知识库架构与数据来源 |
| [superpowers/](superpowers/) | MVP **规格与计划**（实现对照权威） |
| [miniprogram-design/](miniprogram-design/) | 小程序 UI 示意稿（PNG + 说明） |
| [reference/](reference/) | 架构图等静态素材 |
| [archive/](archive/) | 仅附件留档（如 Word），无单独说明文档 |

**勿在 `docs/` 根目录新增零散 `.md`**；新主题在子目录建文件，并**在下表补一行**。

---

## 2. 文件索引

| 路径 | 类型 | 说明 |
|------|------|------|
| [writing-standard.md](./writing-standard.md) | 规范 | 文档结构、内容、排版与禁止项 |
| [engineering/deployment.md](./engineering/deployment.md) | 运维 | 环境变量、Compose、本机 Node、Cron、排错 |
| [knowledge/knowledge-base-layered-search-design.md](./knowledge/knowledge-base-layered-search-design.md) | 设计 | 知识库分层与搜索 |
| [knowledge/knowledge-base-data-sourcing.md](./knowledge/knowledge-base-data-sourcing.md) | 设计 | 知识数据来源与进库治理 |
| [superpowers/specs/2026-05-18-wechat-mp-care-mvp-design.md](./superpowers/specs/2026-05-18-wechat-mp-care-mvp-design.md) | 规格 | MVP 工程设计 |
| [superpowers/plans/2026-05-18-wechat-mp-care-mvp.md](./superpowers/plans/2026-05-18-wechat-mp-care-mvp.md) | 计划 | MVP 任务与检查点 |
| [miniprogram-design/README.md](./miniprogram-design/README.md) | 设计 | 小程序示意稿约定与文件对照 |
| [reference/plant-care-architecture.svg](./reference/plant-care-architecture.svg) | 素材 | 架构示意（矢量） |
| [reference/plant-care-architecture.jpg](./reference/plant-care-architecture.jpg) | 素材 | 架构示意（位图） |
| [product/项目预算.md](./product/项目预算.md) | 备忘 | 项目预算 |
| [product/Demo预算.md](./product/Demo预算.md) | 备忘 | Demo 预算 |
| [product/竞品分析.md](./product/竞品分析.md) | 备忘 | 竞品分析 |
| [product/项目计划书 - 详细.md](./product/项目计划书%20-%20详细.md) | 备忘 | 详细计划书 |
| [product/项目计划书 - 投资人.md](./product/项目计划书%20-%20投资人.md) | 备忘 | 投资人版 |
| [product/idea.md](./product/idea.md) | 备忘 | 创意与方向笔记 |
| [product/场景.txt](./product/场景.txt) | 备忘 | 场景备忘 |
| `archive/2026 AI 大赛项目计划书.docx` | 附件 | 大赛 Word 原稿 |

---

## 3. 快速入口

| 场景 | 阅读 |
|------|------|
| 接手开发 | 根目录 `README.md` → `superpowers/specs/...design.md` → `superpowers/plans/...mvp.md` |
| 部署上线 | `engineering/deployment.md` |
| 知识库 | `knowledge/knowledge-base-layered-search-design.md` → `knowledge-base-data-sourcing.md` |
| 小程序视觉 | `miniprogram-design/README.md` |
| 写或改任何 `docs` 文档 | 先读 `writing-standard.md` |

---

## 4. 自动化路径（勿随意改名）

- `docs/superpowers/specs/2026-05-18-wechat-mp-care-mvp-design.md`
- `docs/superpowers/plans/2026-05-18-wechat-mp-care-mvp.md`  

变更时同步 `.cursor/rules/verify-ship.mdc` 与 CI 中引用。
