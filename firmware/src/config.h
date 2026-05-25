#pragma once

// ============================================================
//  Stage Toggles — set 1 to enable, 0 to disable
// ============================================================
#define STAGE_SERIAL       1
#define STAGE_OLED         1
#define STAGE_TTS          0
#define STAGE_PH           1
#define STAGE_BLE_WIFI     1
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

// ============================================================
//  Sensor Constants
// ============================================================
#define SOIL_DRY_MAX       1200
#define SOIL_WET_MIN       2800
