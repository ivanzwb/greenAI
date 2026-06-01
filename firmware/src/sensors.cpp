#include "config.h"
#include "sensors.h"
#include "ph_sensor.h"
#include "i2c_utils.h"
#include <Wire.h>
#include <BH1750.h>
#include <DFRobot_SHT3x.h>
#include <cmath>

// 提前声明（实际定义在文件后面）
extern bool g_bh1750Available;

// ============================================================
//  BH1750 (Wire1)
// ============================================================
static BH1750 lightMeter(0x23);

static bool bh1750Init() {
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire1)) return true;
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x5C, &Wire1)) return true;
    return false;
}

// 当 BH1750 在 Wire1 上连续读失败，尝试解锁总线 + 重新初始化。
// 不影响 Wire (SHT30 + OLED) 总线。
static const int BH1750_FAIL_THRESHOLD = 3;
static int       g_bh1750FailCount     = 0;
static unsigned long g_bh1750LastRecoverMs = 0;
static const unsigned long BH1750_RECOVER_COOLDOWN_MS = 5000UL;

static void bh1750TryRecover() {
    unsigned long now = millis();
    if (now - g_bh1750LastRecoverMs < BH1750_RECOVER_COOLDOWN_MS) return;
    g_bh1750LastRecoverMs = now;
    Serial.println("[BH1750] read failing, recovering Wire1 bus...");
    Wire1.end();
    delay(5);
    i2cBusRecover(PIN_LIGHT_SDA, PIN_LIGHT_SCL);
    Wire1.begin(PIN_LIGHT_SDA, PIN_LIGHT_SCL);
    Wire1.setClock(100000);
    Wire1.setTimeOut(50);
    delay(10);
    g_bh1750Available = bh1750Init();
    Serial.printf("[BH1750] recover -> %s\n", g_bh1750Available ? "OK" : "FAIL");
    g_bh1750FailCount = 0;
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
//  土壤湿度（与 test_soil 相同标定：电容 V2.0 @ 3.3V，raw 大=干）
// ============================================================
static int soilMoisturePercentFromRaw(int raw) {
    int pct = map(raw, SOIL_ADC_DRY, SOIL_ADC_WET, 0, 100);
    return constrain(pct, 0, 100);
}

static bool soilRawLooksValid(int raw) {
    // 浮空/未接时常见贴 0 或 4095；有效读数应落在标定区间附近
    return raw > 200 && raw < 4050;
}

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
    analogSetAttenuation(ADC_11db);
    pinMode(PIN_SOIL_MOISTURE, INPUT);
#if STAGE_PH
    pinMode(PIN_PH, INPUT);
    for (int i = 0; i < 5; i++) {
        (void)analogRead(PIN_PH);
        delayMicroseconds(200);
    }
    {
        const int        phRawOnce = analogRead(PIN_PH);
        const uint32_t   phMvOnce  = analogReadMilliVolts(PIN_PH);
        Serial.printf("[ADC] pH selftest GPIO%d: raw=%d mV=%u (<%d 断线/GND；>=%d 顶格→降Po/分压后标定)\n",
                      PIN_PH, phRawOnce, (unsigned)phMvOnce, 21, PH_ADC_HIGH_SAT_RAW);
    }
#endif
    Serial.printf("[ADC] Soil=GPIO%d, pH=GPIO%d, 12-bit 11dB\n",
                  PIN_SOIL_MOISTURE, PIN_PH);
    Serial.printf("[ADC] Soil cal: dry>=%d wet<=%d (see test_soil)\n",
                  SOIL_ADC_DRY, SOIL_ADC_WET);
    return g_sht3xAvailable || g_bh1750Available;
}

// ============================================================
//  SHT30 读数合理性（DFRobot 库在 I2C 失败时常返回 0.0 而非 NaN）
// ============================================================
static bool shtReadLooksValid(float t, float h) {
    if (isnan(t) || isnan(h)) return false;
    // 两路同时「接近 0」在正常运行里极罕见，且与 Wire 报错同时出现时多为失败哨兵值
    if (fabsf(t) < 1e-3f && fabsf(h) < 1e-3f) return false;
    // SHT30 规格量级（略放宽）
    if (t < -45.0f || t > 130.0f || h < 0.0f || h > 101.0f) return false;
    return true;
}

// SHT30 与 OLED 共用 Wire；连续读失败时做 SCL 解锁 + 重新 begin（与 BH1750 在 Wire1 上恢复思路类似）
static int               g_shtReadFailStreak    = 0;
static unsigned long     g_shtLastWireRecoverMs = 0;
static const int         SHT_WIRE_FAIL_FOR_RECOVER       = 6;
static const unsigned long SHT_WIRE_RECOVER_COOLDOWN_MS    = 5000UL;

static void sht30TryRecoverSharedWire() {
    unsigned long now = millis();
    if (now - g_shtLastWireRecoverMs < SHT_WIRE_RECOVER_COOLDOWN_MS) return;
    g_shtLastWireRecoverMs = now;
    Serial.println("[SHT30] read failing — bus recover + re-init (Wire shared with OLED)…");
    i2cBusRecover(PIN_SHT_SDA, PIN_SHT_SCL);
    delay(5);
    Wire.begin(PIN_SHT_SDA, PIN_SHT_SCL);
    Wire.setClock(100000);
    Wire.setTimeOut(50);
    delay(10);
    int tries = 0;
    while (sht3x.begin() != 0) {
        if (++tries >= 3) {
            Serial.println("[SHT30] recover: begin() still FAIL (check SDA/SCL/VCC/GND)");
            return;
        }
        delay(50);
    }
    if (!sht3x.softReset()) Serial.println("[SHT30] recover: softReset returned false");
    delay(80);
    Serial.println("[SHT30] recover: done");
}

// ============================================================
//  传感器数据采集
// ============================================================
SensorData readAllSensors() {
    SensorData d;

    if (g_sht3xAvailable) {
        float t = sht3x.getTemperatureC();
        float h = sht3x.getHumidityRH();
        const bool ok = !isnan(t) && !isnan(h) && shtReadLooksValid(t, h);
        if (ok) {
            d.temperature = t;
            d.humidity    = h;
            d.sensorOK[0] = true;
            g_shtReadFailStreak = 0;
        } else {
            if (++g_shtReadFailStreak >= SHT_WIRE_FAIL_FOR_RECOVER) {
                sht30TryRecoverSharedWire();
                g_shtReadFailStreak = 0;
            }
        }
    }

    if (g_bh1750Available) {
        float lux = lightMeter.readLightLevel();
        if (lux >= 0 && !isnan(lux)) {
            d.lux = lux;
            d.sensorOK[1] = true;
            g_bh1750FailCount = 0;
        } else {
            if (++g_bh1750FailCount >= BH1750_FAIL_THRESHOLD) {
                bh1750TryRecover();
            }
        }
    }

#if STAGE_PH
    int   phRawAvg = 0;
    float phVal    = NAN;
    const bool phOk = phReadOfficial(&phRawAvg, &phVal);
    d.phRaw = phRawAvg;
    if (phOk && isfinite(phVal)) {
        d.pH          = phVal;
        d.sensorOK[3] = true;
    } else {
        d.pH          = NAN;
        d.sensorOK[3] = false;
    }
#endif

    // —— 土壤湿度：先读 pH 再 flush + 中值采样（与 test_soil 同标定，多采抑制噪声）——
    {
        for (int i = 0; i < 5; i++) {
            (void)analogRead(PIN_SOIL_MOISTURE);
            delayMicroseconds(200);
        }

        const int N = 25;
        int samples[N];
        for (int i = 0; i < N; i++) {
            samples[i] = analogRead(PIN_SOIL_MOISTURE);
            delay(4);
        }
        for (int i = 1; i < N; i++) {
            int v = samples[i], j = i - 1;
            while (j >= 0 && samples[j] > v) { samples[j + 1] = samples[j]; j--; }
            samples[j + 1] = v;
        }
        int median = samples[N / 2];

        static bool  s_soilInit = false;
        static float s_soilFilt = 0.0f;
        if (!s_soilInit) { s_soilFilt = (float)median; s_soilInit = true; }
        else             { s_soilFilt = 0.15f * (float)median + 0.85f * s_soilFilt; }
        int raw = (int)(s_soilFilt + 0.5f);

        d.soilRaw     = raw;
        d.soilPercent = soilMoisturePercentFromRaw(raw);
        d.sensorOK[2] = soilRawLooksValid(raw);
    }

    return d;
}
