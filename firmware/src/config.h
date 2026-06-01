#pragma once

// ============================================================
//  Stage Toggles — set 1 to enable, 0 to disable
// ============================================================
#define STAGE_SERIAL       1
#define STAGE_OLED         1
#define STAGE_TTS          1
#define STAGE_PH           1
#define STAGE_WIFI_PROV    1   // SoftAP 配网
#define STAGE_WIFI_UPLOAD  1

/**
 * 量产配网：将 GREENAI_PROVISION_EMBED_API_BASE 置 1，并设置 GREENAI_API_BASE_DEFAULT
 * 为带引号的 API 根 URL（无路径尾斜杠，如 "https://api.example.com"），配网页将注入该地址
 * 且不再展示「后端 API 根地址」输入框。
 * 开发/自托管：保持 GREENAI_PROVISION_EMBED_API_BASE 为 0；GREENAI_API_BASE_DEFAULT 可为 ""，
 * 在配网页折叠区填写 API。
 */
#ifndef GREENAI_PROVISION_EMBED_API_BASE
#  define GREENAI_PROVISION_EMBED_API_BASE 0
#endif
#ifndef GREENAI_API_BASE_DEFAULT
#  define GREENAI_API_BASE_DEFAULT ""
#endif

// 语音：仅 LU6288 类模块（UART 标记协议 + GBK），与 firmware/test-voice-lu6288 同源；勿接宇音 SYN6288 0xFD 协议片。

// ============================================================
//  Pin Definitions
// ============================================================
// Wire  (I²C0): SHT30 + OLED 共用
#define PIN_SHT_SDA        5
#define PIN_SHT_SCL        4

// Wire1 (I²C1): BH1750
#define PIN_LIGHT_SDA      6
#define PIN_LIGHT_SCL      7

// 模拟输入
#define PIN_SOIL_MOISTURE  1
#define PIN_PH             2

// TTS UART1
#define PIN_TTS_RX         18
#define PIN_TTS_TX         17

/** 1: 每次 ttsSpeak 后读模块 TX→ESP RX 并打印 hex；调通后可改 0 省约 100ms。 */
#ifndef TTS_DEBUG_MODULE_RX
#  define TTS_DEBUG_MODULE_RX 1
#endif

// 板载 LED
#define PIN_LED_BUILTIN    48

// BOOT 按钮（ESP32-S3-DevKitC 默认是 GPIO0，低电平按下）
#define PIN_BOOT_BUTTON    0

// 长按 BOOT 多少毫秒触发清凭证 + 重启
#define BOOT_LONG_PRESS_MS 5000UL

// ============================================================
//  Sensor Constants
// ============================================================
// 电容式 V2.0 @ 3.3V：raw 越大越干（本探头实测：空气 ~3250，清水 ~1530）
#define SOIL_ADC_DRY       3260
#define SOIL_ADC_WET       1520

// pH：V = 还原到模块 Po 侧的电压(伏)：Vgpio=phRaw*3.3/4095；分压开启时 V=3*Vgpio，否则 V=Vgpio。
//       pH = PH_SLOPE * V + PH_OFFSET。未标定前默认斜率仅作占位。
// 单点 pH7：在 pH7.01 缓冲液里读 pH_read，PH_OFFSET += (7.0f - pH_read)，斜率可先不动。
// 两点 pH4+pH7：记 V7、V4，PH_SLOPE=(7-4)/(V7-V4)，PH_OFFSET=7 - PH_SLOPE*V7。
#define PH_SLOPE                   3.5f
#define PH_OFFSET                  2.1f  // 单点 pH7：缓冲液里曾读 4.9 → +2.1；若当时不是 pH7 液请重标
#define PH_USE_VOLTAGE_DIVIDER_3   1   // 1 = Po 经 10k+20k 分压到 GPIO2
#define PH_ADC_HIGH_SAT_RAW        4080  // raw≥此值不报 pH（ADC 顶格）
