/**
 * @file main.cpp
 * @brief PlantGuardian 硬件 Demo — 主控入口
 *
 * 总线分配:
 *   Wire  (I²C0, GPIO5 SDA / GPIO4 SCL): SHT30 + OLED (SSD1306)
 *   Wire1 (I²C1, GPIO6 SDA / GPIO7 SCL): BH1750
 */

#include <Arduino.h>
#include <Wire.h>
#include <esp_system.h>

#include "config.h"
#include "i2c_utils.h"
#include "sensors.h"
#include "display.h"
#include "tts.h"
#include "network.h"

// ============================================================
//  Serial CSV
// ============================================================
#if STAGE_SERIAL
static void serialPrint(const SensorData& d) {
    Serial.printf("T=%.1f,H=%.0f%%,Lux=%.0f,Soil=%d(%d%%),",
                  d.temperature, d.humidity, d.lux, d.soilRaw, d.soilPercent);
#if STAGE_PH
    Serial.printf("phRaw=%d,", d.phRaw);
    if (d.sensorOK[3]) Serial.printf("pH=%.1f", d.pH);
    else               Serial.print("pH=--(rail)");
#endif
    Serial.println();
}
#endif

// ============================================================
//  Setup
// ============================================================
static const char* resetReasonLabel(esp_reset_reason_t r) {
    switch (r) {
        case ESP_RST_UNKNOWN:   return "unknown";
        case ESP_RST_POWERON:   return "poweron";
        case ESP_RST_EXT:       return "ext";
        case ESP_RST_SW:        return "sw";
        case ESP_RST_PANIC:     return "panic";
        case ESP_RST_INT_WDT:   return "int_wdt";
        case ESP_RST_TASK_WDT:  return "task_wdt";
        case ESP_RST_WDT:       return "wdt";
        case ESP_RST_DEEPSLEEP: return "deepsleep";
        case ESP_RST_BROWNOUT:  return "brownout";
        case ESP_RST_SDIO:      return "sdio";
        default:                return "?";
    }
}

static void printResetReason() {
    esp_reset_reason_t r = esp_reset_reason();
    Serial.printf("[RESET] reason=%d (%s)\n", (int)r, resetReasonLabel(r));
    if (r == ESP_RST_BROWNOUT) {
        Serial.println("[RESET] 欠压复位 — 移动杜邦线/USB 后常见，检查供电与接触");
    } else if (r == ESP_RST_SW) {
        Serial.println("[RESET] 软件复位 — 若未长按 BOOT，查是否误触 GPIO0");
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n==============================================");
    Serial.println(" PlantGuardian — Modular Firmware");
    Serial.println("==============================================");
    Serial.println("[POWER] brownout detector enabled (default)");
    printResetReason();

    pinMode(PIN_LED_BUILTIN, OUTPUT);
    digitalWrite(PIN_LED_BUILTIN, LOW);
    pinMode(PIN_BOOT_BUTTON, INPUT_PULLUP);

    // --- I²C 总线恢复 ---
    i2cBusRecover(PIN_SHT_SDA,  PIN_SHT_SCL);
    i2cBusRecover(PIN_LIGHT_SDA, PIN_LIGHT_SCL);

    // --- I²C 初始化 ---
    Wire.begin(PIN_SHT_SDA, PIN_SHT_SCL);
    Serial.printf("[Wire ] SDA=GPIO%d SCL=GPIO%d (SHT30 + OLED)\n", PIN_SHT_SDA, PIN_SHT_SCL);
    Wire1.begin(PIN_LIGHT_SDA, PIN_LIGHT_SCL);
    Wire1.setClock(100000);     // BH1750 用低速更稳，避免长线/弱上拉导致 stuck
    Wire1.setTimeOut(50);       // 单次事务最长 50ms，避免拖死主循环
    Serial.printf("[Wire1] SDA=GPIO%d SCL=GPIO%d (BH1750)\n", PIN_LIGHT_SDA, PIN_LIGHT_SCL);
    delay(50);

    // --- 模块初始化 ---
    displayInit();    // OLED (HW I²C, 与 SHT30 共线, 板载上拉稳定总线)
    initSensors();    // SHT30 + BH1750 + ADC 分辨率
    ttsInit();        // TTS (UART1)
    delay(200);
    // 启动测试：让喇叭朗读一句话 + OLED 上眨眼动画
    ttsSpeak("植物管家已启动");
    displayBootAnimation();
    wifiProvSetup();  // BLE 配网 / WiFi 连接

    Serial.println("--- Setup complete ---");
    Serial.printf("[STATUS] SHT30=%s  BH1750=%s\n",
                  g_sht3xAvailable  ? "OK" : "FAIL",
                  g_bh1750Available ? "OK" : "FAIL");
    Serial.println();
}

// ============================================================
//  BOOT 按钮长按清凭证
// ============================================================
static bool bootButtonStableLow() {
    for (int i = 0; i < 8; i++) {
        if (digitalRead(PIN_BOOT_BUTTON) != LOW) return false;
        delay(5);
    }
    return true;
}

static void checkBootButton() {
    static unsigned long pressStart = 0;
    static bool          fired      = false;
    bool pressed = bootButtonStableLow();

    if (pressed) {
        if (pressStart == 0) {
            pressStart = millis();
            Serial.println("[BOOT] stable press, hold 5s to clear WiFi creds...");
        }
        unsigned long held = millis() - pressStart;
        // 闪烁 LED 表示正在计时
        digitalWrite(PIN_LED_BUILTIN, (held / 200) & 1 ? HIGH : LOW);
        if (!fired && held >= BOOT_LONG_PRESS_MS) {
            fired = true;
            digitalWrite(PIN_LED_BUILTIN, HIGH);
            Serial.println("[BOOT] LONG PRESS — clearing creds and rebooting...");
            wifiClearCreds();
            delay(500);
            ESP.restart();
        }
    } else {
        if (pressStart != 0) {
            unsigned long held = millis() - pressStart;
            Serial.printf("[BOOT] released after %lu ms\n", held);
            digitalWrite(PIN_LED_BUILTIN, LOW);
        }
        pressStart = 0;
        fired      = false;
    }
}

// ============================================================
//  浇水检测：土壤湿度从 DRY 阈值以下升到 WET 阈值以上 → 触发拟人化回馈
// ============================================================
static float         g_soilEma          = NAN;
static unsigned long g_lastWaterAnnounceMs = 0;
static const float        SOIL_EMA_ALPHA      = 0.3f;
static const int          SOIL_DRY_PCT        = 25;     // EMA 低于此值视为干
static const int          SOIL_WET_PCT        = 55;     // EMA 高于此值视为湿
static const unsigned long WATER_COOLDOWN_MS  = 30000UL; // 30s 内不重复播报
static bool g_soilWasDry = false;

static void detectWatering(const SensorData& d) {
    if (!d.sensorOK[2]) return;
    float now_pct = (float)d.soilPercent;
    if (isnan(g_soilEma)) g_soilEma = now_pct;
    else                  g_soilEma = SOIL_EMA_ALPHA * now_pct + (1.0f - SOIL_EMA_ALPHA) * g_soilEma;

    if (g_soilEma < SOIL_DRY_PCT) {
        g_soilWasDry = true;
    } else if (g_soilWasDry && g_soilEma > SOIL_WET_PCT) {
        unsigned long now = millis();
        if (now - g_lastWaterAnnounceMs > WATER_COOLDOWN_MS) {
            g_lastWaterAnnounceMs = now;
            g_soilWasDry          = false;
            Serial.printf("[WATER] event detected, EMA=%.1f%%\n", g_soilEma);
            ttsSpeakWatering();
        }
    }
}

// ============================================================
//  Loop
// ============================================================
static unsigned long lastSensorMillis = 0;
static const unsigned long SENSOR_INTERVAL_MS = 2000;
static SensorData lastData;

void loop() {
    checkBootButton();
    wifiProvLoop();

    unsigned long now = millis();
    if (now - lastSensorMillis >= SENSOR_INTERVAL_MS || lastSensorMillis == 0) {
        lastSensorMillis = now;
        lastData = readAllSensors();
        lastData.wifiConnected = wifiIsConnected();

#if STAGE_SERIAL
        serialPrint(lastData);
#endif
        detectWatering(lastData);
        ttsLoop(lastData);
        uploadSensorData(lastData);
    }

    displayUpdate(lastData);
    delay(500);
    yield();
}
