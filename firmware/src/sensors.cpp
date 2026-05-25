#include "config.h"
#include "sensors.h"
#include <Wire.h>
#include <BH1750.h>
#include <DFRobot_SHT3x.h>

// ============================================================
//  BH1750 (Wire1)
// ============================================================
static BH1750 lightMeter(0x23);

static bool bh1750Init() {
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire1)) return true;
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x5C, &Wire1)) return true;
    return false;
}

// ============================================================
//  SHT30 (Wire)
// ============================================================
static DFRobot_SHT3x sht3x(&Wire, /*addr=*/0x44);

static bool sht3xInit() {
    int tries = 0;
    while (sht3x.begin() != 0) {
        if (++tries >= 5) {
            Serial.println("[SHT30] begin() FAIL after 5 tries");
            return false;
        }
        Serial.println("SHT30 初始化失败，请检查接线！");
        delay(1000);
    }
    Serial.println("SHT30 初始化成功");
    Serial.print("SHT30 序列号: ");
    Serial.println(sht3x.readSerialNumber());
    if (!sht3x.softReset()) {
        Serial.println("SHT30 软件复位失败");
    }
    delay(100);
    return true;
}

// ============================================================
//  pH 校准参数
// ============================================================
#if STAGE_PH
static const float PH_VOLTAGE_DIVISOR = 3.0;
static float PH_SLOPE  = 3.0;
static float PH_OFFSET = 0.0;
#endif

// ============================================================
//  Global state
// ============================================================
bool g_sht3xAvailable  = false;
bool g_bh1750Available = false;

bool initSensors() {
    g_sht3xAvailable = sht3xInit();

    if (bh1750Init()) {
        Serial.println("[BH1750] OK");
        g_bh1750Available = true;
    } else {
        Serial.println("[BH1750] FAIL");
    }

    analogReadResolution(12);
    Serial.printf("[ADC] Soil=GPIO%d, pH=GPIO%d\n", PIN_SOIL_MOISTURE, PIN_PH);
    return g_sht3xAvailable || g_bh1750Available;
}

// ============================================================
//  传感器数据采集
// ============================================================
SensorData readAllSensors() {
    SensorData d;

    if (g_sht3xAvailable) {
        float t = sht3x.getTemperatureC();
        float h = sht3x.getHumidityRH();
        if (!isnan(t) && !isnan(h)) {
            d.temperature = t;
            d.humidity    = h;
            d.sensorOK[0] = true;
        }
    }

    if (g_bh1750Available) {
        float lux = lightMeter.readLightLevel();
        if (lux >= 0 && !isnan(lux)) {
            d.lux = lux;
            d.sensorOK[1] = true;
        }
    }

    d.soilRaw = analogRead(PIN_SOIL_MOISTURE);
    d.sensorOK[2] = true;
    if (d.soilRaw <= SOIL_DRY_MAX) {
        d.soilPercent = 0;
    } else if (d.soilRaw >= SOIL_WET_MIN) {
        d.soilPercent = 99;
    } else {
        d.soilPercent = map(d.soilRaw, SOIL_DRY_MAX, SOIL_WET_MIN, 0, 99);
        d.soilPercent = constrain(d.soilPercent, 0, 99);
    }

#if STAGE_PH
    int phRaw = analogRead(PIN_PH);
    if (phRaw > 0) {
        float voltage = phRaw * (3.3f / 4095.0f) * PH_VOLTAGE_DIVISOR;
        d.pH = PH_SLOPE * voltage + PH_OFFSET;
        d.pH = constrain(d.pH, 0.0f, 14.0f);
        d.sensorOK[3] = true;
    }
#endif

    return d;
}
