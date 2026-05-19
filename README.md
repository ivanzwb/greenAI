# 植物管家 (greenAI)

微信小程序「植物管家」—— 一款面向家庭的植物养护管理工具。后端 Fastify + Prisma + PostgreSQL，前端微信小程序原生开发。

## 功能一览

### 微信小程序

| 页面 | 功能 |
|---|---|
| **首页** | 今日待办养护任务列表（浇水/施肥）、完成/跳过操作 |
| **识别** | 拍照识花、AI 拍照诊断、症状诊断入口 |
| **知识** | 养护知识搜索与文章列表（本地 + 远程） |
| **我的** | 植物列表、添加/编辑/删除植物；设置入口（时区、定位、订阅消息） |

### 后端 API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| POST | `/auth/wechat` | 微信 `jscode2session` 登录，返回 JWT |
| GET | `/users/me` | 获取/创建当前用户 |
| PATCH | `/users/me` | 更新时区、经纬度 |
| GET | `/plants` | 用户植物列表 |
| POST | `/plants` | 添加植物 |
| GET | `/plants/:id` | 植物详情 |
| PATCH | `/plants/:id` | 编辑植物 |
| DELETE | `/plants/:id` | 删除植物 |
| POST | `/plants/:id/regenerate` | 重新生成养护计划 |
| POST | `/plants/identify` | 百度 AI 拍照识花（需配置密钥） |
| GET | `/tasks/today` | 今日任务列表 |
| POST | `/tasks/:id/complete` | 完成任务（自动重算下次计划） |
| POST | `/tasks/:id/skip` | 跳过任务 |
| POST | `/subscribe/report` | 上报订阅消息结果 |
| GET | `/weather/forecast` | 用户所在地 3 天天气预报 |
| POST | `/diagnose/symptoms` | 规则式症状诊断 |
| POST | `/diagnose/photo` | 视觉 LLM 植物诊断 |
| POST | `/soil/estimate-photo` | 土壤照片 LLM 分析 |
| GET | `/knowledge/search?q=` | 养护知识搜索 |
| GET | `/metrics/summary` | 内部统计概览 |
| POST | `/internal/reminders` | HMAC 鉴权的内部提醒任务 |

### 养护引擎

- **浇水间隔计算**：根据植物浇水偏好（喜湿/中性/耐旱）、室内外、有无暖气、光照等级、盆土湿度提示综合计算基础天数
- **天气系数调整**：结合 Open-Meteo 预报的降水量、湿度、阴天天数，自动缩短或延长浇水间隔
- **施肥计划**：根据浇水节奏按比例生成施肥任务
- **计划重算**：每次完成/跳过任务后自动生成后续 horizon 内的任务
- **订阅提醒**：通过微信订阅消息推送养护提醒，含失败重试退避

## 快速开始

### 前置条件

- Node.js 20+
- 微信开发者工具
- Docker & Docker Compose（可选，用于本地后端部署）
- PostgreSQL 16（如不通过 Docker Compose）

### 1. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少填写：

```env
WECHAT_APPID=wx你的小程序AppId
WECHAT_SECRET=你的小程序AppSecret
JWT_SECRET=一个至少16位的随机字符串
POSTGRES_PASSWORD=数据库密码
DATABASE_URL=postgresql://greenai:密码@db:5432/greenai
```

### 2. 启动后端（Docker Compose）

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --build
```

API 默认监听 `http://localhost:3000`。

### 3. 本地开发启动后端

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy    # 或 migrate dev 首次建库
npm run dev
```

### 4. 打开微信开发者工具

1. 导入 `miniprogram/` 目录
2. 修改 `miniprogram/utils/api.js` 中的 `BASE_URL` 为你的 API 地址（默认 `http://127.0.0.1:3000`），开发工具中记得勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」
3. 编译运行

### 5. 运行测试

```bash
cd backend
npm test          # 单元测试（39 项）
npm run build     # TypeScript 编译
```

## 文档

- **索引与文件清单**：[docs/README.md](docs/README.md)  
- **文档写作规范**（结构、内容、排版）：[docs/writing-standard.md](docs/writing-standard.md)  
- **部署说明**：[docs/engineering/deployment.md](docs/engineering/deployment.md)

## 部署

### Docker Compose 部署

`deploy/docker-compose.prod.yml` 包含 API 服务 + PostgreSQL 16，一条命令启动：

```bash
# 从项目根目录执行
docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --build api
```

### 环境变量

| 变量 | 必需 | 说明 |
|---|---|---|
| `WECHAT_APPID` | ✅ | 微信小程序 AppID |
| `WECHAT_SECRET` | ✅ | 微信小程序 AppSecret |
| `JWT_SECRET` | ✅ | JWT 签名密钥（≥16 字符） |
| `DATABASE_URL` | ✅ | Postgres 连接串 |
| `POSTGRES_PASSWORD` | ✅ | Compose 部署时 Postgres 密码 |
| `CRON_HMAC_SECRET` | ✅ | 内部任务 HMAC 签名密钥 |
| `SUBSCRIBE_TEMPLATE_ID` | ✅ | 微信订阅消息模板 ID |
| `PORT` | 否 | API 监听端口（默认 3000） |
| `BAIDU_API_KEY` | 否 | 百度 AI 植物识别（需同时填 `BAIDU_SECRET_KEY`） |
| `BAIDU_SECRET_KEY` | 否 | 百度 AI 密钥 |
| `DIAGNOSE_LLM_API_KEY` | 否 | 视觉诊断 LLM API Key |
| `DIAGNOSE_LLM_BASE_URL` | 否 | 视觉诊断 LLM 地址（默认 OpenAI） |
| `DIAGNOSE_LLM_MODEL` | 否 | 视觉诊断 LLM 模型（默认 gpt-4o-mini） |
| `SKIP_INTEGRATION_TESTS` | 否 | 设为 `1` 跳过需数据库的集成测试 |
| `API_PUBLISH_PORT` | 否 | Compose 发布端口（默认 3000） |

## CI

GitHub Actions 每个 push 自动执行（`.github/workflows/ci.yml`）：

- **Backend**：TypeScript 编译 + 单元测试（PostgreSQL service container）
- **Docker Compose**：Compose 文件配置校验
- **Miniprogram JSON**：小程序 JSON 配置文件完整性校验

## 技术栈

| 层 | 技术 |
|---|---|
| **后端框架** | Fastify 4 (TypeScript) |
| **ORM** | Prisma (PostgreSQL) |
| **认证** | JWT + 微信 jscode2session |
| **天气预报** | Open-Meteo API |
| **AI** | 百度 AI 植物识别、OpenAI 兼容 LLM 视觉诊断 |
| **部署** | Docker Compose (API + PostgreSQL 16) |
| **小程序** | 微信原生开发 (基础库 3.x) |
| **CI** | GitHub Actions |

## 项目结构

```
greenAI/
├── backend/                  # Fastify API 服务
│   ├── src/
│   │   ├── routes/           # 路由处理器
│   │   ├── services/         # 外部 API 调用（微信、Open-Meteo、百度等）
│   │   ├── domain/           # 养护引擎业务逻辑
│   │   └── lib/              # 工具函数（时区、日期等）
│   ├── prisma/               # Schema + 迁移
│   └── Dockerfile
├── miniprogram/              # 微信小程序
│   ├── pages/                # 页面（首页、识别、知识、我的、设置等）
│   ├── utils/                # 工具（API 请求封装）
│   └── data/                 # 静态知识数据
├── deploy/                   # 部署配置
│   ├── docker-compose.prod.yml
│   ├── deploy.sh
│   └── deploy.ps1
├── scripts/
│   └── ship.mjs             # 一键提交+推送脚本
└── .github/workflows/
    └── ci.yml                # GitHub Actions CI
```
