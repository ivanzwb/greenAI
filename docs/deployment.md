# greenAI 部署说明

本文覆盖 **自建 API（Fastify + Prisma + PostgreSQL）** 与 **微信小程序** 上线所需步骤。小程序不在 Docker 内构建，需在 **微信开发者工具** 中上传与发布。

---

## 1. 前置条件

| 组件 | 说明 |
|------|------|
| Node.js | **20+**（本地开发、CI、Dockerfile 一致） |
| PostgreSQL | **16**（生产可用托管实例或下文 Compose 中的 `db`） |
| Docker | 可选；使用 `deploy/docker-compose.prod.yml` 时需要 Docker Compose v2 |

---

## 2. 环境变量

在仓库根目录复制模板并填写（**不要提交**真实 `.env`）：

```bash
cp .env.example .env
```

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串，**必须以** `postgresql://` 或 `postgres://` 开头 |
| `JWT_SECRET` | 至少 16 字符，用于签发用户 JWT |
| `WECHAT_APPID` / `WECHAT_SECRET` | 微信小程序后台「开发 → 开发管理 → 开发设置」 |
| `CRON_HMAC_SECRET` | 至少 16 字符；与云 Cron 共用，用于签名 `POST /internal/jobs/reminders` |
| `SUBSCRIBE_TEMPLATE_ID` | 已审核的订阅消息模板 ID，须与小程序里 `SUBSCRIBE_TEMPLATE_ID` 一致 |
| `PORT` | API 监听端口，默认 `3000`（容器内端口；对外映射见下文） |

### 使用 `deploy/docker-compose.prod.yml` 时

根目录 `.env` 还需包含：

```bash
# 数据库容器密码（勿用弱口令）
POSTGRES_PASSWORD=your-strong-password

# API 容器内访问 Compose 网络中的 Postgres，主机名为 db
DATABASE_URL=postgresql://greenai:your-strong-password@db:5432/greenai

# 可选：宿主机映射端口，默认 3000
API_PUBLISH_PORT=3000
```

---

## 3. 方式 A：Docker Compose 一键栈（推荐小流量 / 单机）

在 **仓库根目录** 执行（Linux / macOS / WSL）：

```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

Windows（PowerShell，仓库根目录）：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\deploy\deploy.ps1
```

脚本会：`docker compose -f deploy/docker-compose.prod.yml up -d --build`，并轮询 `GET /health`。

手动等价命令：

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --build
curl -fsS http://127.0.0.1:3000/health
```

**首次 / 升级数据库结构**：API 容器启动时会执行 `npx prisma migrate deploy`（见 `backend/docker-entrypoint.sh`），无需在宿主机单独跑迁移。

查看日志：

```bash
docker compose -f deploy/docker-compose.prod.yml logs -f api
```

---

## 4. 方式 B：仅数据库用 Docker，API 本机 Node

1. 启动本地 Postgres（可用根目录 `docker compose up -d` 仅起 `db`）。
2. `backend/.env` 或根目录 `.env` 中 `DATABASE_URL` 指向 `localhost`。
3. 在 `backend/` 目录：

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run start
```

生产建议使用 **systemd**、**pm2** 或进程管理器守护 `node dist/server.js`，并配置崩溃重启与日志轮转。

---

## 5. 公网 HTTPS 与域名

- 小程序 **request 合法域名** 必须为 **HTTPS**，且不能使用 IP 白名单绕过（需备案域名按微信规则配置）。
- 在 API 前放置 **反向代理**（Caddy / Nginx / 云 LB），将 `443` → 本机 `3000`（或 Compose 映射端口）。
- 确保代理转发 `Authorization` 头；若需排查，可透传 `x-request-id`。

---

## 6. 定时提醒任务（Cron → 内部接口）

调度器每 15 分钟（或每小时）请求：

`POST https://YOUR_DOMAIN/internal/jobs/reminders`

请求头：

- `x-timestamp`：Unix 秒时间戳  
- `x-signature`：`hex(HMAC_SHA256(CRON_HMAC_SECRET, String(timestamp)))`（小写十六进制）

**Linux / macOS（bash）示例：**

```bash
SECRET="your-cron-hmac-secret"
TS=$(date +%s)
SIG=$(printf '%s' "$TS" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -sS -X POST "https://YOUR_DOMAIN/internal/jobs/reminders" \
  -H "x-timestamp: $TS" \
  -H "x-signature: $SIG"
```

**PowerShell 示例：**

```powershell
$SECRET = "your-cron-hmac-secret"
$ts = [int][double]::Parse((Get-Date -UFormat %s))
$hmac = [System.Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($SECRET))
$sig = -join ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$ts")) | ForEach-Object { $_.ToString("x2") })
curl.exe -sS -X POST "https://YOUR_DOMAIN/internal/jobs/reminders" -H "x-timestamp: $ts" -H "x-signature: $sig"
```

---

## 7. 微信小程序

1. 在 `miniprogram/utils/api.js` 将 `BASE_URL` 改为 **HTTPS API 根地址**（无尾部斜杠）。
2. 将 `SUBSCRIBE_TEMPLATE_ID` 与后端 `SUBSCRIBE_TEMPLATE_ID`、微信公众平台模板保持一致。
3. 在微信公众平台配置 **服务器域名**（request 合法域名）。
4. 使用开发者工具 **上传** → 提交 **审核** → **发布**。

---

## 8. 健康检查与运维

- 负载均衡探活：`GET /health` → `{"ok":true}`  
- 数据库备份：对 PostgreSQL 卷或托管实例按云厂商策略做快照 / `pg_dump`。
- 升级流程：拉取新镜像或新代码 → `deploy` 脚本或 `migrate deploy` + 重启 API → 观察日志与 `/health`。

---

## 9. 文件索引

| 路径 | 用途 |
|------|------|
| `backend/Dockerfile` | 生产 API 镜像（构建 + 内置 `migrate deploy` 入口） |
| `backend/docker-entrypoint.sh` | 启动前迁移，再启动 `node dist/server.js` |
| `deploy/docker-compose.prod.yml` | `api` + `db` 编排 |
| `deploy/deploy.sh` / `deploy/deploy.ps1` | 一键构建并启动栈 + 健康检查 |
| `docker-compose.yml` | 本地仅 Postgres 开发用 |
| `.env.example` | 环境变量模板 |

如有防火墙，仅对反向代理或 LB 开放 **443**；内部 **3000** 可不对外暴露。
