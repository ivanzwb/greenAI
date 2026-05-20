# 小程序对接第三方温湿度 / 光照等传感器（Wi-Fi 或蓝牙）

本文说明：**允许**用户在「植物管家」小程序侧，对接市面常见的 **带 Wi-Fi 或蓝牙（通常为 BLE）** 的环境传感器，把 **温度、湿度、光照** 等读数纳入产品叙事或后续云端逻辑。
当前仓库 **v1 MVP** 仍以 **后端 Open-Meteo + 用户定位** 为主；第三方设备为 **增量能力**，需在 **微信公众平台「用户隐私保护指引」** 中如实声明采集项与用途。

---

## 1. 能力边界（微信侧）

| 通道 | 小程序能做什么 | 典型限制 |
|------|------------------|----------|
| **BLE** | `wx.openBluetoothAdapter`、`startBluetoothDevicesDiscovery`、`createBLEConnection`、`getBLEDeviceCharacteristics`、`readBLECharacteristicValue`、`onBLECharacteristicValueChange` 等 | 需 **用户授权**；不同品牌 **Service/Characteristic UUID** 不同，需 **按厂商协议单独适配**；iOS/Android 行为差异需真机测 |
| **经典蓝牙（非 BLE）** | 一般 **不支持** 或场景极窄 | 不要承诺「任意经典蓝牙外设」 |
| **设备直连 Wi-Fi Socket** | 小程序 **不能** 像 App 一样随便 TCP 连家里传感器 | 常见做法是 **设备连云 → 我方 HTTPS 后端拉取/订阅** |
| **Wi-Fi 设备** | 多为 **设备 ↔ 厂商云**，小程序只调 **自家后端** | 需厂商 **开放 API / OAuth / 用户绑定 token**；注意密钥 **禁止写死在小程序包** |

结论：**「允许对接」** 在产品上落地为三条技术路线——**BLE 直连（逐品牌适配，仅做读数浏览）**、**Wi-Fi 经厂商云 + 我方后端代理**、**自研/可信设备直传后端（路线 C，推荐）**。**v0.3 起的主路径为 §6 路线 C**；BLE 仅保留为 **一次性配网通道**（见 §6.9）。

---

## 2. 路线 A：BLE 直连（第三方 BLE 传感器，仅备查）

### 2.1 前置条件

1. 小程序管理后台：**用户隐私保护指引** 增加「蓝牙」相关说明（用途：连接用户自选的环境监测硬件）。
2. `app.json` 已配置 `permission.scope.bluetooth` 的 `desc`（用户可见说明）。
3. 目标设备文档：**GATT 表**（Service UUID、Characteristic UUID、字节序、notify/indicate 与否）。

### 2.2 适配方式（推荐工程化）

- 为每个合作品牌维护一份 **「驱动描述」**（JSON）：含 UUID、解码函数名、单位换算；小程序运行时 **仅加载已白名单品牌**。
- 或把解码放在 **后端**：小程序 BLE 读到 **原始 hex** → `wx.request` 上传 → 后端返回结构化 `{ tempC, rh, lux }`（便于密钥与算法保密，但依赖网络）。

### 2.3 与现有业务的关系（建议）

- **展示**：设置页 / 植物详情可展示「室内传感器：xx℃ / xx% / xx lx」。
- **引擎**：若要把读数写入 `careEngine`，需定义 **与 Open-Meteo 的融合策略**（例如：有传感器则以传感器为准，无则天气；冲突时取保守浇水策略）。**属产品决策**，未落库前勿静默改写生产逻辑。

### 2.4 仓库内入口（v0.3 已重构）

- 旧的「检测蓝牙（实验）」按钮已**移除**。BLE 不再作为持续数据通路，仅用于 **首次配网**。
- 新入口：**设置 → 第三方环境监测 → 前往配网向导**（[`miniprogram/pages/device-provision/`](../../miniprogram/pages/device-provision/)）。当前为占位向导（4 步说明 + 模态「配网协议尚未集成」），后续逐型号补 GATT 表与配网代码时再扩展。
- 正式对接某一 BLE 传感器（如果产品上确有需要做持续数据读取）时，建议放入独立分包 `packageDevice` 控制主包体积。

---

## 3. 路线 B：Wi-Fi 传感器（经厂商云）

### 3.1 典型架构

```text
[ 第三方 Wi-Fi 传感器 ] → HTTPS → [ 厂商云 ]
                                    ↓ OAuth / user token / webhook
[ greenAI 后端 ] ← HTTPS ← [ 小程序 ]
```

### 3.2 小程序职责

- **只做**：引导用户完成 **厂商账号授权** 或粘贴 **设备绑定码**；把 token 交给 **自家后端**（`wx.request`）。
- **不做**：在小程序里硬编码厂商 `client_secret`；不在小程序直连厂商内网 IP。

### 3.3 后端职责（后续迭代）

- 存储 **userId ↔ 厂商 refresh_token / device_id**（加密字段）。
- 定时任务或 webhook 拉取最新读数，写入 `User` 扩展字段或 `DeviceReading` 表。
- 对小程序暴露：`GET /users/me/sensor-readings` 等只读接口。

---

## 4. 合规与安全清单（上线前自检）

- [ ] 隐私指引含 **蓝牙 / 设备信息 / 位置**（若仍用定位）等项，与 **实际调用 API** 一致。
- [ ] 未在客户端写死 **厂商密钥**；HTTPS 证书与域名在 **微信公众平台 → 服务器域名** 白名单内。
- [ ] 第三方协议变更（UUID 变更、云 API 下线）有 **降级策略**（回退到仅天气）。
- [ ] 用户可 **解绑设备** 并删除云端 token。

---

## 5. 与 FAST 硬件 Demo 的关系

面包板 Demo（`docs/reference/hardware-demo/FAST-DEMO-modular-breadboard.md`）可走 **BLE 广播自定义 UUID**；与小程序联调前，需把 **Service/Characteristic** 固定下来并在本文 **2.2** 的白名单 JSON 中登记。

如果改走 **Wi-Fi / 蜂窝直连后端**（推荐用于长期 7×24 采样），见下文 **§6 设备端定时上传协议**。

---

## 6. 设备端定时上传协议（路线 C：自研硬件 / 可信网关）

> **适用场景**：自研 ESP32/ESP8266/Pi 等设备，或厂商网关已知会主动 POST 我方后端；设备端有可信存储用于保管 HMAC 密钥。**不适用**于小程序直传（密钥不能下发到客户端）。

### 6.1 接口

- 方法：`POST /internal/sensors/ingest`
- 头：
  - `Content-Type: application/json`
  - `x-timestamp`：Unix 秒
  - `x-signature`：`hex(HMAC_SHA256(SENSOR_HMAC_SECRET, ts + "\n" + sha256_hex(rawBody)))`，**小写十六进制**
- 时钟偏差：服务端容忍 **±300 秒**，设备需通过 NTP 或上一次响应的 `Date` 头校时
- 鉴权失败：`401 { "error": "invalid_signature" }`
- 未配置 `SENSOR_HMAC_SECRET`：`503 { "error": "sensor_ingest_disabled" }`

### 6.2 请求体

```json
{
  "hardwareId": "esp32-aabbccddeeff",
  "userId": "ckxxxx...",
  "plantId": "ckyyyy...",
  "readings": [
    { "measuredAt": "2026-05-20T10:00:00.000Z", "tempC": 22.4, "soilMoisture": 42.5, "phLevel": 6.5, "lux": 320 },
    { "measuredAt": "2026-05-20T10:15:00.000Z", "tempC": 22.6, "soilMoisture": 41.8 }
  ]
}
```

- `hardwareId`：设备序列号 / MAC，与 `userId` 联合唯一定位一条 `Device` 记录。
- `userId`：出厂前在「用户绑定」流程中烧录到设备（小程序登录态拿到 `userId` → 通过 BLE/二维码灌入设备）。
- `plantId`：**可选**。传入后服务端会校验该植物属于 `userId`，并 upsert 到 `Device.plantId`；care planning 会针对该植物汇聚本设备的读数。传 `null` 可解除绑定，不传则保持现状。未绑定植物的房间级设备也可上报，数据落库供运维查询，不会自动进入某株植物的计算。
- `readings[]`：1–200 笔；至少包含 `tempC` / `soilMoisture` / `phLevel` / `lux` 其中之一。
  - `tempC`：环境温度 ℃（探针热敏或设备内置传感器）。
  - `soilMoisture`：**土壤湿度 0..100 %**（电容 / 电阻探针）。注意**不是空气相对湿度**。
  - `phLevel`：土壤 pH 0..14（pH 探针）。
  - `lux`：光照（光敏）。
- `measuredAt`：ISO 字符串或 Unix 秒（整数）。服务端按 `(deviceId, measuredAt)` **唯一去重**，断网回灌可放心重传。

### 6.3 响应

```json
{ "deviceId": "ckyyyy...", "inserted": 2, "deduped": 0 }
```

幂等：同一批次重发，`inserted=0` 且 `deduped=2`。

### 6.4 定时策略建议

| 项 | 建议值 | 备注 |
|---|---|---|
| 采样间隔 | 5–15 分钟 | 与 `careEngine` 的天气数据粒度对齐 |
| 上报方式 | 攒 N 笔后批量 POST | 减少耗电与 TLS 握手开销 |
| 离线缓冲 | 设备 Flash 环形队列 ≥ 24 小时 | 网络恢复后用同样的 ingest 接口回灌（去重自动处理） |
| 失败退避 | 指数退避（如 1m → 2m → 4m → … 上限 30m） | 配 jitter，避免群体同时重连 |
| 时钟同步 | 启动时一次 NTP + 每 24 小时一次 | 否则 `±300s` 偏差校验会拒签 |

### 6.5 设备端伪代码（任意语言）

```text
loop every 10 minutes:
    sample tempC, rh, lux
    push to local ring buffer
    if buffer >= 6 readings or 30min since last upload:
        body  := json({ hardwareId, userId, readings })
        ts    := unix_seconds(now())
        h     := sha256_hex(body)
        sig   := hmac_sha256_hex(SENSOR_SECRET, ts + "\n" + h)
        resp  := POST /internal/sensors/ingest with headers x-timestamp, x-signature
        if resp.ok: clear buffer
        else: backoff and retry
```

### 6.6 配置与运维

- 后端环境变量 `SENSOR_HMAC_SECRET`（≥16 字符，未配置时路由整体禁用）。
- 与 `CRON_HMAC_SECRET` **分离**：cron 调度器和设备权限边界不同，密钥泄露后可分别轮换。
- 路由命名仍在 `/internal/*` 前缀下；生产部署务必确认入口网关 **不对公网无差别开放**（HMAC 是兜底，纵深防御以网络隔离为先）。
- 数据落库：`Device(userId, hardwareId, plantId?)`、`DeviceReading(deviceId, measuredAt, tempC, soilMoisture, phLevel, lux)`；唯一约束保证回灌幂等。

### 6.7 与 careEngine 的融合策略

一句话：**有传感器且读数新鲜时优先用传感器，否则退回到原有「天气 + 用户自报」逻辑。**

实现：[`backend/src/lib/sensorAggregate.ts`](../../backend/src/lib/sensorAggregate.ts) + [`backend/src/domain/careEngine.ts`](../../backend/src/domain/careEngine.ts) 中的 `fusePlantEnvWithSensor` / `fuseWeatherWithSensor`。

| 传感器读数 | 有读数时 | 无读数时 |
|---|---|---|
| `tempC`（环境温度） | 覆盖 `WeatherSnapshot.temperatureC` | 用 Open-Meteo 结果 |
| `soilMoisture`（0..100 %） | `soilMoistureHintFromPercent` 映射到 5 档后覆盖 `env.soilMoistureHint` | 用用户自报的 `soilMoistureHint` |
| `lux` | `lightLevelFromLux` 映射后覆盖 `env.lightLevel`（<500/500–3000/>3000） | 用用户自报的 `lightLevel` |
| `phLevel` | 用 `evaluatePhAgainstPreference(ph, SpeciesProfile.phPreferredMin, phPreferredMax)` 评估，经 `GET /plants/:id` 返回 `phEvaluation`（`too_acidic` / `optimal` / `too_alkaline` / `unknown`）。偏好区间**优先从百度百科描述自动抽取**（[`extractPhPreferenceFromText`](../../backend/src/services/baiduPlantIdentify.ts)），其次由 LLM 推断，缓存到 `SpeciesProfile`；都没有时回退到通用园艺区间 6.0–7.0（`DEFAULT_PH_PREFERRED_*`）。**只用于展示提示，不参与浇水/施肥间隔计算**——pH 异常应通过换土或调节剂解决，而不是改变浇水频率 | 同左（无传感器读数即 `unknown`） |
| 空气相对湿度 | **传感器不测**，仍用 Open-Meteo 的 `relativeHumidity` | 同左 |
| 限雨预报（湿/干偏置） | 始终以 Open-Meteo 预报为准（传感器看不到未来） | 同左 |
| `airConditioning` / `windowAspect` / `waterSkipStreak` | 仍使用用户自报值 | 同左 |

“新鲜”的定义：`measuredAt` 在调度时刻的 **近 6 小时**内（`DEFAULT_SENSOR_FRESH_HOURS`）。超出则视同无传感器，避免用过期读数干扰决策。

生效路线：增量生效。调用点在完成任务（[`POST /tasks/:id/complete`](../../backend/src/routes/tasks.ts)）、跳过任务（`POST /tasks/:id/skip`）、手动重算（[`POST /plants/:id/replan`](../../backend/src/routes/plants.ts)）三处；创建植物时由于设备还未绑定，不走传感器路线。

> **部署顺序**：先 `prisma migrate deploy`（新建 `Device` / `DeviceReading` 表）→ 设定 `SENSOR_HMAC_SECRET` → 重启后端服务。后端未设定该密钥时，`/internal/sensors/ingest` 返回 503，传感器融合逻辑自动退化为原有「天气 + 用户自报」路线。

### 6.8 小程序「植物-传感器」展示与绑定（v0.3）

页面：[`miniprogram/pages/plant-sensors/`](../../miniprogram/pages/plant-sensors/)，入口在「我的 → 植物 → 养护计划页 → 传感器与图表 →」。

- **接口**：
  - `GET /plants/:id/sensor/series?hours=72`（默认 72，最大 14×24=336）——返回该植物绑定设备 **窗口内的读数序列（下采样到 ≤240 点）**、最新读数与 `phEvaluation`。
  - `GET /devices`——当前用户全部设备（含 `plantId`、`label`、`lastSeenAt`）。
  - `PATCH /devices/:id { plantId?, label? }`——绑定到某植物 / 解绑（`plantId: null`）/ 改名。后端校验设备与植物均归属当前用户。
- **UI 元素**：
  - 顶部 pH 评估条（`optimal` / `too_acidic` / `too_alkaline` / `unknown`，绿/橙/紫/灰边框）。
  - 4 张指标卡（温度 / 土壤湿度 / pH / 光照），每张含最新值 + 28 柱 CSS sparkline；缺值用低透明灰柱标识；Y 轴自适应（指标安全区间 ∩ 数据 ±15% padding）。
  - 已绑定设备列表 + 解绑按钮；候选设备列表 + 「绑定到此植物」按钮（已绑到别株会标注「当前绑定：xxx」）。
  - 「添加新设备」按钮跳转到配网向导（§2.4）。
- **空态**：未绑定任何设备时 4 张卡显示「暂无数据」占位，pH 评估条显示 `unknown`。

### 6.9 BLE 在 v0.3 的角色

- `app.json` 仍保留 `scope.bluetooth` 权限声明，**仅供配网向导**（§2.4）使用——通常流程：开启适配器 → 扫描设备热点（出厂未配网时设备进入广播模式）→ 通过 BLE 特征值把 SSID/口令灌入 → 设备转入正常 Wi-Fi 运行 → 此后所有数据通过 §6 路线 C 直传后端，与小程序解耦。
- 不再期望小程序作为「常驻数据中继」（旧路线 A 的隐含模型），避免小程序冷启动 / 后台杀死导致的数据空洞。

---

## 7. 参考（微信官方）

- [蓝牙低功耗（BLE）](https://developers.weixin.qq.com/miniprogram/dev/framework/device/bluetooth.html)
- [小程序用户隐私保护指引](https://developers.weixin.qq.com/miniprogram/dev/framework/user-privacy/)

（链接以微信文档为准，若变更请自行更新。）
