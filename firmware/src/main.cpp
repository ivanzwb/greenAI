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
    if (d.sensorOK[3]) Serial.printf("pH=%.1f", d.pH);
    else               Serial.print("pH=--");
#endif
    Serial.println();
}
#endif

// ============================================================
//  Setup
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n==============================================");
    Serial.println(" PlantGuardian — Modular Firmware");
    Serial.println("==============================================");

    pinMode(PIN_LED_BUILTIN, OUTPUT);
    digitalWrite(PIN_LED_BUILTIN, LOW);

    // --- I²C 总线恢复 ---
    i2cBusRecover(PIN_SHT_SDA,  PIN_SHT_SCL);
    i2cBusRecover(PIN_LIGHT_SDA, PIN_LIGHT_SCL);

    // --- I²C 初始化 ---
    Wire.begin(PIN_SHT_SDA, PIN_SHT_SCL);
    Serial.printf("[Wire ] SDA=GPIO%d SCL=GPIO%d (SHT30 + OLED)\n", PIN_SHT_SDA, PIN_SHT_SCL);
    Wire1.begin(PIN_LIGHT_SDA, PIN_LIGHT_SCL);
    Serial.printf("[Wire1] SDA=GPIO%d SCL=GPIO%d (BH1750)\n", PIN_LIGHT_SDA, PIN_LIGHT_SCL);
    delay(50);

    // --- 模块初始化 ---
    displayInit();    // OLED (HW I²C, 与 SHT30 共线, 板载上拉稳定总线)
    initSensors();    // SHT30 + BH1750 + ADC 分辨率
    ttsInit();        // TTS (UART1)
    wifiProvSetup();  // BLE 配网 / WiFi 连接

    Serial.println("--- Setup complete ---");
    Serial.printf("[STATUS] SHT30=%s  BH1750=%s\n",
                  g_sht3xAvailable  ? "OK" : "FAIL",
                  g_bh1750Available ? "OK" : "FAIL");
    Serial.println();
}

// ============================================================
//  Loop
// ============================================================
static unsigned long lastSensorMillis = 0;
static const unsigned long SENSOR_INTERVAL_MS = 2000;
static SensorData lastData;

void loop() {
    wifiProvLoop();

    unsigned long now = millis();
    if (now - lastSensorMillis >= SENSOR_INTERVAL_MS || lastSensorMillis == 0) {
        lastSensorMillis = now;
        lastData = readAllSensors();

#if STAGE_SERIAL
        serialPrint(lastData);
#endif
        ttsLoop(lastData);
        uploadSensorData(lastData);
    }

    displayUpdate(lastData);
    delay(500);
}
