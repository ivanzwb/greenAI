# 植物管家 (greenAI) — 固件

针对 **ESP32-S3-N16R8** 的面包板模块化固件：传感器采集 → OLED 中文显示 → WiFi 配网 → 后端上报。

## 目录结构

```
firmware/
├── platformio.ini        # 板型 / 库 / 编译选项
├── src/
│   ├── config.h          # Stage 开关、引脚、常量
│   ├── main.cpp          # 主循环 + BOOT 长按复位
│   ├── sensors.{h,cpp}   # SHT30 / BH1750 / 土壤 / pH
│   ├── display.{h,cpp}   # OLED 中文界面 + WiFi 状态图标
│   ├── network.{h,cpp}   # WiFi 配网 (SoftAP + Captive Portal) + 上报调度
│   ├── greenai_api.{h,cpp} # greenAI：HMAC + /internal/sensors/ingest 与 /internal/sensors/logs
│   └── tts.{h,cpp}       # 语音播报 (可选)
└── README.md
```

## 快速开始

### 1. 安装 PlatformIO

VS Code → 扩展 → 搜索 **PlatformIO IDE** → 安装。

### 2. 接线

对照 [FAST-DEMO-breadboard-layout.svg](../FAST-DEMO-breadboard-layout.svg)。引脚定义见 [src/config.h](src/config.h)：

| 信号 | ESP32-S3 引脚 | 模块 |
|------|--------------|------|
| I²C0 SDA / SCL | **GPIO5 / GPIO4** | SHT30 + OLED 共用（OLED 自带 4.7kΩ 上拉） |
| I²C1 SDA / SCL | **GPIO6 / GPIO7** | BH1750（独占总线避免地址冲突） |
| 土壤湿度 AO | **GPIO1** | ADC1, 电容式模块输出 |
| pH 模块 Po | **GPIO2** | ADC1, ⚠ 必须分压 5V→3.3V |
| TTS TX → ESP RX | **GPIO18** | UART1 RX（可选） |
| TTS RX ← ESP TX | **GPIO17** | UART1 TX（可选） |
| BOOT 按钮 | **GPIO0** | 长按 5 秒清凭证 + 重启 |
| 内置 LED | **GPIO48** | 心跳 / 配网期间闪烁 |

### 3. 编译 & 上传

```bash
~/.platformio/penv/Scripts/pio.exe run -t upload -t monitor
```

或 VS Code 状态栏：**Build → Upload → Serial Monitor**。

### 4. 配网

首次开机或长按 BOOT 5 秒后，设备进入配网模式：

1. 手机/电脑连接 SoftAP **`植物管家-配网`**（开放，无密码）
2. 系统通常自动弹出配网页面；否则浏览器访问 `http://192.168.4.1`
3. 选择 WiFi → 输入密码 → 填写 **后端 API 根地址**（如 `http://192.168.1.10:3000`，**不要**带 `/internal/...` 路径）→ **用户 ID**、**上报密钥**（与服务器 `SENSOR_HMAC_SECRET` 相同，≥16 字符）→ 可选 **植物 ID** → **保存并连接**
4. OLED 右上角 WiFi 图标常亮即表示连接成功；带斜杠表示未连接

配网凭证保存在 NVS 命名空间 `plantguard`（键：`ssid` / `pass` / `apiBase` / `bindCode` / `userId` / `sensorKey` / `plantId`）。`bindCode` 用于一次性 claim；成功后固件会写入 `userId` 并清除 `bindCode`。

### 云端上报（greenAI）

当 `apiBase`、`bindCode`（小程序生成的绑定码）已写入 NVS 且 STA 联网、NTP 有效时，固件会先 `POST {apiBase}/devices/claim-binding-code` 换取 `userId`（及可选 `sensorKey`），再按间隔上报传感器读数。连接后 **SNTP 校时**，再对 JSON 原文做 **SHA256 + HMAC-SHA256**，请求 `POST {apiBase}/internal/sensors/ingest` 与 `POST {apiBase}/internal/sensors/logs`（含上电 `device_boot`、上报失败等日志）。协议见 [docs/engineering/miniprogram-third-party-sensors.md](../docs/engineering/miniprogram-third-party-sensors.md) §6。

## Stage 开关

[src/config.h](src/config.h) 顶部按需开关功能：

```c
#define STAGE_SERIAL       1   // 串口 CSV 输出
#define STAGE_OLED         1   // OLED 中文显示
#define STAGE_TTS          0   // 语音播报
#define STAGE_PH           1   // pH 读取
#define STAGE_WIFI_PROV    1   // SoftAP 配网
#define STAGE_WIFI_UPLOAD  1   // 上报后端
```

建议**逐个打开**验证，不要一次全开。

## 重要提醒

### ⚡ pH 分压（必须）

pH4502C 等模块为 **5V 供电，0~5V 模拟输出**，ESP32-S3 ADC 最大 **3.3V**。必须在 Po → GPIO2 之间分压（10kΩ + 20kΩ，分压比 1/3）：

```
pH模块 Po ──┬─ 10kΩ ──┬─ GPIO2
            │         │
           GND      20kΩ
                     │
                    GND
```

### 中文字体

OLED 使用 `u8g2_font_wqy12_t_gb2312a`（~70KB Flash）。`platformio.ini` 已加 `-DU8G2_USE_ALL_FONTS`，并调用 `enableUTF8Print()`。

### 双 I²C 总线

SHT30 与 BH1750 默认地址段会冲突；本工程让 BH1750 独占 `Wire1`，OLED + SHT30 共用 `Wire`（OLED 模块自带的 4.7kΩ 上拉给两个从机共用）。

## BOOT 长按复位

正常运行时**按住 BOOT 键 5 秒**：
- LED 每 200ms 闪烁一次作为反馈
- 触发后清空 NVS 中保存的 SSID / 密码 / API 与上报相关字段
- 自动重启进入配网模式

短按或不足 5 秒释放不会触发。

## 排障

| 现象 | 原因 |
|------|------|
| 串口无输出 | COM 口选错；波特率不是 115200；USB CDC 还在重连 |
| I²C 扫不到设备 | SDA/SCL 接反；没共地；上拉电阻缺失 |
| OLED 中文乱码 / 方块 | 字库没编译进去（检查 `U8G2_USE_ALL_FONTS`） |
| 配网页打不开 | 浏览器没走 captive portal；手动访问 `192.168.4.1` |
| `request handler not found` 日志 | 无害，captive portal 探测路径，已 fallback 到主页 |
| `Connection reset by peer` | 无害，手机端切页/息屏导致 |
| pH 读数跳变 | 分压电阻没接；探头未校准；探头空气中浮动正常 |
| 土壤湿度不准 | 标定值（`SOIL_ADC_DRY` / `SOIL_ADC_WET`）需按探头在 3.3V 下实测调整 |
