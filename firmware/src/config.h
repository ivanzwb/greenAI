#pragma once

// ============================================================
//  Stage Toggles — set 1 to enable, 0 to disable
// ============================================================
#define STAGE_SERIAL       1
#define STAGE_OLED         1
#define STAGE_TTS          1
#define STAGE_PH           1
#define STAGE_WIFI_PROV    1
#define STAGE_WIFI_UPLOAD  1

#define TTS_MODEL_SYN6288   0
#define TTS_MODEL_XFS5152   1
#define TTS_MODEL           TTS_MODEL_SYN6288

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

// pH DFRobot 官方算法: pH = PH_SLOPE * Vmodule + PH_OFFSET
#define PH_SLOPE                   3.5f
#define PH_OFFSET                  0.0f
#define PH_USE_VOLTAGE_DIVIDER_3   0   // 1 = Po 经 10k+20k 分压到 GPIO2
