/**
 * @file main.cpp
 * @brief PlantGuardian 硬件 Demo 固件 — 模块化面包板版本
 *
 * 开发板: ESP32-S3-N16R8
 * 框架:   PlatformIO + Arduino
 *
 * 目标:
 *   Step 5  (STAGE_SERIAL):   串口打印传感器读数
 *   Step 6  (STAGE_OLED):     OLED 中文四行显示
 *   Step 6b (STAGE_TTS):      中文 TTS 声音播报 (SYN6288 / XFS5152)
 *   Step 7  (STAGE_PH):       土壤 pH 读数 (趋势级)
 *
 * 接线与布局:
 *   docs/reference/hardware-demo/FAST-DEMO-modular-breadboard.md
 *   docs/reference/hardware-demo/FAST-DEMO-breadboard-layout.svg
 *
 * 使用方式:
 *   1. 初次烧录 → 确认串口有数据 (STAGE_SERIAL=1, 其余=0)
 *   2. 确认 I²C 地址 → 开 OLED (STAGE_OLED=1)
 *   3. 确认 TTS 串口无乱码 → 开 STAGE_TTS
 *   4. 确认 pH 分压正确 → 开 STAGE_PH
 */

#include <Arduino.h>
#include <Wire.h>

// ============================================================
//  Stage Toggles — 按步骤逐级打开，不要一次全开
// ============================================================
#define STAGE_SERIAL     1   // [Step 5]  串口 CSV 输出
#define STAGE_OLED       1   // [Step 6]  OLED 中文显示 (依赖 U8g2)
#define STAGE_TTS        0   // [Step 6b] 中文 TTS 播报 (确认串口通后再开)
#define STAGE_PH         1   // [Step 7]  pH 模拟读数 (买了电极)

// TTS 模块型号选择 (STAGE_TTS=1 时生效)
// 0 = SYN6288, 1 = XFS5152 (协议帧不同)
#define TTS_MODEL_SYN6288   0
#define TTS_MODEL_XFS5152   1
#define TTS_MODEL           TTS_MODEL_SYN6288   // ← 按你买的模块改

// ============================================================
//  Pin Definitions (与 FAST-DEMO 接线图对齐)
// ============================================================
//  I²C 总线 (共总线: OLED + SHT40 + BH1750)
#define PIN_I2C_SDA        8
#define PIN_I2C_SCL        9

//  模拟输入 (ADC1, 仅输入脚)
#define PIN_SOIL_MOISTURE  1   // ADC1_CH0 — 电容式土壤湿度
#define PIN_PH             2   // ADC1_CH1 — pH 模块 Po (注意 ⚡ 分压!)

//  TTS 串口 (UART1)
#define PIN_TTS_RX         18  // ESP RX  ← TTS TX
#define PIN_TTS_TX         17  // ESP TX  → TTS RX

//  LED 指示 (大部分 S3 开发板载 GPIO48)
#define PIN_LED_BUILTIN    48

//  土壤 ADC 原始值范围 (电容式典型值)
//  干燥空气 ≈ 800-1200, 水中 ≈ 2800-3500
//  ⚠ 你的模块可能不同 — 首次跑串口观察实际 range
const int SOIL_DRY_MAX   = 1200;
const int SOIL_WET_MIN   = 2800;

// ============================================================
//  全局对象 — 通过 Stage Toggle 有条件编译
// ============================================================
#if STAGE_OLED
#  include <U8g2lib.h>
   // U8G2_SSD1306_128X64_NONAME_F_HW_I2C 使用 Wire (默认 I²C)
   // 初始化时调用 u8g2.begin() 前必须已 Wire.begin(SDA, SCL)
   U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);
#endif

#if STAGE_PH
   // pH 模拟前端分压系数:
   // 如果 pH4502C 输出 0~5V → 经 10k+20k 分压 (1/3) → 0~1.667V 入 ADC
   // 此时 ADC 读满量程 ≈ 4095 → 实际电压 = adc * (3.3 / 4095) * 3 (还原)
   // 若不接分压直接接 3.3V 模块则 divisor=1
   const float PH_VOLTAGE_DIVISOR = 3.0;  // 5V 分压到 3.3V 比率
   // pH 电压→pH 值经验公式 (需用缓冲液校准后修改斜率和截距)
   //   pH = PH_SLOPE * voltage + PH_OFFSET
   //   典型值: slope=3.5, offset=0.5 (取决于电极和模块)
   float PH_SLOPE  = 3.0;
   float PH_OFFSET = 0.0;
#endif

// ============================================================
//  TTS 驱动 (SYN6288 / XFS5152 通用框架)
// ============================================================
#if STAGE_TTS
#  include <HardwareSerial.h>
   HardwareSerial TTS_Serial(1);  // UART1

   /**
    * @brief 发送 GB2312 文本到 TTS 模块播报
    * @param text  GB2312 编码的字符串 (C 风格)
    *
    * SYN6288 帧格式:
    *   0xFD <LenH> <LenL> 0x01 <DATA...> <XOR>
    *   - Len: 从 0x01 到 DATA 最后一个字节的字节数 (不含 XOR)
    *   - XOR: 从 0xFD 到 DATA 最后一个字节的逐字节异或
    *
    * XFS5152 帧格式:
    *   0xFD <LenH> <LenL> 0x01 <DATA...>
    *   - Len: 从 0x01 到 DATA 最后一个字节的字节数
    *   无 XOR, 模块自己判断结束
    */
   void ttsSpeak(const char* text) {
       size_t dataLen = strlen(text);           // 文本字节数
       size_t frameLen = 1 + dataLen;           // 1 (command) + data
       uint8_t xor_check = 0;

       // 帧头
       TTS_Serial.write(0xFD);
       xor_check ^= 0xFD;

       // 长度 (大端)
       TTS_Serial.write((uint8_t)(frameLen >> 8));
       TTS_Serial.write((uint8_t)(frameLen & 0xFF));
       xor_check ^= (uint8_t)(frameLen >> 8);
       xor_check ^= (uint8_t)(frameLen & 0xFF);

       // 命令: 0x01 = 合成播放文本
       TTS_Serial.write(0x01);
       xor_check ^= 0x01;

       // 文本数据
       for (size_t i = 0; i < dataLen; i++) {
           uint8_t c = (uint8_t)text[i];
           TTS_Serial.write(c);
           xor_check ^= c;
       }

#if TTS_MODEL == TTS_MODEL_SYN6288
       // SYN6288 需要 XOR 校验
       TTS_Serial.write(xor_check);
#elif TTS_MODEL == TTS_MODEL_XFS5152
       // XFS5152 不需要校验
       // 部分型号需要 0x00 结束
       // TTS_Serial.write(0x00);
#endif
       TTS_Serial.flush();
   }

   /**
    * @brief 将浮点数转为中文读音字符串 (缓冲区)
    * @param val   浮点数值
    * @param buf   输出缓冲区 (至少 32 字节)
    * @param unit  单位字符串 (GB2312), 传 nullptr 不附加
    *
    * 例如: val=24.5, unit="摄氏度" → "二十四点五摄氏度"
    * ⚠ 简化实现: 使用阿拉伯数字读音, 避免复杂的中文数字转换
    *   模块通常自动将数字字符读为对应数字音
    */
   void ttsFormatReading(float val, const char* unit, char* buf, size_t bufSize) {
       // 简单格式化: 直接拼数字 + 单位
       // 模块会按 ASCII 数字发音 (多数 TTS 模块支持)
       dtostrf(val, 1, 1, buf);  // 保留 1 位小数
       if (unit != nullptr) {
           strncat(buf, unit, bufSize - strlen(buf) - 1);
       }
   }
#endif // STAGE_TTS

// ============================================================
//  I²C 传感器封装
// ============================================================

// BH1750 光照
#if 1  // 始终包含
#  include <BH1750.h>
    BH1750 lightMeter(0x23);  // 默认地址; 若 ADDR 接高则 0x5C

    bool bh1750Init() {
        if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x23, &Wire)) {
            return true;
        }
        // 尝试第二个地址
        if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, 0x5C, &Wire)) {
            return true;
        }
        return false;
    }
#endif

// SHT4x 温湿度
#if 1
#  include <Adafruit_SHT4x.h>
   Adafruit_SHT4x sht4 = Adafruit_SHT4x();

   bool sht4Init() {
       if (!sht4.begin(&Wire)) {
           return false;
       }
       // 精度: HIGH 最高, MEDIUM 均衡, LOW 快
       sht4.setPrecision(SHT4X_HIGH_PRECISION);
       sht4.setHeater(SHT4X_NO_HEATER);
       return true;
   }
#endif

// ============================================================
//  传感器数据结构
// ============================================================
struct SensorData {
    float temperature = NAN;   // 空气温度 ℃
    float humidity    = NAN;   // 空气湿度 %
    float lux         = NAN;   // 光照 lux
    int   soilRaw     = 0;     // 盆土 ADC 原始值 0~4095
    int   soilPercent = 0;     // 映射到 0~99 (%)
    float pH          = NAN;   // pH 值 (STAGE_PH)
    bool  sensorOK[4] = {false, false, false, false}; // SHT/BH/Soil/pH
};

// ============================================================
//  传感器读取函数 (可被串口 / OLED / TTS 共享)
// ============================================================
SensorData readAllSensors() {
    SensorData d;
    static bool shtOk = true;  // try once, then stop on first failure
    static bool bhOk  = true;

    // --- SHT40: 空气温湿度 ---
    if (shtOk) {
        sensors_event_t humidityEvent, tempEvent;
        if (sht4.getEvent(&humidityEvent, &tempEvent)) {
            d.temperature = tempEvent.temperature;
            d.humidity    = humidityEvent.relative_humidity;
            d.sensorOK[0] = true;
        } else {
            shtOk = false;  // stop trying, saves I2C bus
        }
    }

    // --- BH1750: 光照 ---
    if (bhOk) {
        float lux = lightMeter.readLightLevel();
        if (lux >= 0 && !isnan(lux)) {
            d.lux = lux;
            d.sensorOK[1] = true;
        } else {
            bhOk = false;  // stop trying
        }
    }

    // --- 电容式土壤湿度 (原始 ADC) ---
    d.soilRaw = analogRead(PIN_SOIL_MOISTURE);
    d.sensorOK[2] = true;

    // 映射到 0~99%
    // 需先跑串口观察你的模块实际 DRY/WET 值, 再调整 SOIL_DRY_MAX / SOIL_WET_MIN
    if (d.soilRaw <= SOIL_DRY_MAX) {
        d.soilPercent = 0;
    } else if (d.soilRaw >= SOIL_WET_MIN) {
        d.soilPercent = 99;
    } else {
        d.soilPercent = map(d.soilRaw, SOIL_DRY_MAX, SOIL_WET_MIN, 0, 99);
        d.soilPercent = constrain(d.soilPercent, 0, 99);
    }

    // --- pH (可选) ---
#if STAGE_PH
    int phRaw = analogRead(PIN_PH);
    if (phRaw > 0) {
        // ADC → 实际电压 → 分压还原 → pH
        float voltage = phRaw * (3.3f / 4095.0f) * PH_VOLTAGE_DIVISOR;
        d.pH = PH_SLOPE * voltage + PH_OFFSET;
        d.pH = constrain(d.pH, 0.0f, 14.0f);
        d.sensorOK[3] = true;
    }
#endif

    return d;
}

// ============================================================
//  屏幕显示 (OLED 中文四行)
// ============================================================
#if STAGE_OLED
void displayUpdate(const SensorData& d) {
    char buf[32];  // Bigger buffer for UTF-8

    u8g2.clearBuffer();

    // 行 1: 温度
    if (d.sensorOK[0]) {
        snprintf(buf, sizeof(buf), "T:%.1f C", d.temperature);
    } else {
        snprintf(buf, sizeof(buf), "T:-- C");
    }
    u8g2.drawUTF8(0, 14, buf);

    // 行 2: 湿度
    if (d.sensorOK[0]) {
        snprintf(buf, sizeof(buf), "H:%.0f%%", d.humidity);
    } else {
        snprintf(buf, sizeof(buf), "H:--%%");
    }
    u8g2.drawUTF8(0, 29, buf);

    // 行 3: 光照
    if (d.sensorOK[1]) {
        snprintf(buf, sizeof(buf), "L:%.0f lx", d.lux);
    } else {
        snprintf(buf, sizeof(buf), "L:-- lx");
    }
    u8g2.drawUTF8(0, 44, buf);

    // 行 4: 盆土 + pH
    if (d.sensorOK[2]) {
#if STAGE_PH
        if (d.sensorOK[3]) {
            snprintf(buf, sizeof(buf), "Soil:%d pH:%.1f", d.soilPercent, d.pH);
        } else {
            snprintf(buf, sizeof(buf), "Soil:%d pH:--", d.soilPercent);
        }
#else
        snprintf(buf, sizeof(buf), "Soil:%d", d.soilPercent);
#endif
    } else {
        snprintf(buf, sizeof(buf), "Soil:--");
    }
    u8g2.drawUTF8(0, 59, buf);

    u8g2.sendBuffer();
}
#endif // STAGE_OLED

// ============================================================
//  TTS 播报 (循环播报或阈值告警)
// ============================================================
#if STAGE_TTS
unsigned long lastTTSMillis = 0;
const unsigned long TTS_INTERVAL_MS = 60000;  // 每 60 秒播报一次

void ttsLoop(const SensorData& d) {
    unsigned long now = millis();

    // 防溢出: millis() 回绕
    if (now - lastTTSMillis < TTS_INTERVAL_MS && lastTTSMillis != 0) return;
    lastTTSMillis = now;

    char buf[64];
    char numBuf[16];
    char fullText[128] = {0};

    // 拼接播报文本 (GB2312)
    strcat(fullText, "当前环境");

    if (d.sensorOK[0]) {
        dtostrf(d.temperature, 1, 1, numBuf);
        strcat(fullText, "温度");
        strcat(fullText, numBuf);
        strcat(fullText, "摄氏度");

        dtostrf(d.humidity, 1, 0, numBuf);
        strcat(fullText, "湿度");
        strcat(fullText, numBuf);
        strcat(fullText, "百分之");
    }

    if (d.sensorOK[2]) {
        snprintf(numBuf, sizeof(numBuf), "%d", d.soilPercent);
        strcat(fullText, "盆土湿度");
        strcat(fullText, numBuf);
    }

#if STAGE_PH
    if (d.sensorOK[3]) {
        dtostrf(d.pH, 1, 1, numBuf);
        strcat(fullText, "酸碱度");
        strcat(fullText, numBuf);
    }
#endif

    // 发送到 TTS 模块
    // ⚠ GB2312 编码: 如果源文件保存为 UTF-8, 中文字符串在编译时
    //   会被工具链正确处理。如果模块要求 GB2312 且输出乱码,
    //   需要在 PC 端将字符串预转 GB2312 字节序列, 或用 iconv 转换。
    ttsSpeak(fullText);
}
#endif // STAGE_TTS

// ============================================================
//  串口 CSV 输出 (Step 5 验收用)
// ============================================================
#if STAGE_SERIAL
void serialPrint(const SensorData& d) {
    Serial.printf("T=%.1f,H=%.0f%%,Lux=%.0f,Soil=%d(%d%%),",
                  d.temperature, d.humidity, d.lux,
                  d.soilRaw, d.soilPercent);
#if STAGE_PH
    if (d.sensorOK[3]) {
        Serial.printf("pH=%.1f", d.pH);
    } else {
        Serial.print("pH=--");
    }
#endif
    Serial.println();
}
#endif

// ============================================================
//  Built-in LED 闪烁指示
// ============================================================
void ledIndicate(bool ok) {
    if (ok) {
        // 正常: 短闪一次
        digitalWrite(PIN_LED_BUILTIN, HIGH);
        delay(30);
        digitalWrite(PIN_LED_BUILTIN, LOW);
    } else {
        // 异常: 长亮 100ms
        digitalWrite(PIN_LED_BUILTIN, HIGH);
        delay(100);
        digitalWrite(PIN_LED_BUILTIN, LOW);
    }
}

// ============================================================
//  I²C 扫描 (调试用)
// ============================================================
void i2cScan() {
    Serial.println("[I2C] Scanning...");
    byte count = 0;
    // First test: raw begin/end without address
    Wire.beginTransmission(0);
    int err0 = Wire.endTransmission();
    Serial.printf("[I2C] test: general_call err=%d (expect 2=NACK)\n", err0);
    
    for (byte addr = 1; addr < 127; addr++) {
        Wire.beginTransmission(addr);
        int err = Wire.endTransmission();
        if (err == 0) {
            Serial.printf("  Found 0x%02X", addr);
            switch (addr) {
                case 0x3C: case 0x3D: Serial.print(" (OLED)"); break;
                case 0x23: case 0x5C: Serial.print(" (BH1750)"); break;
                case 0x44:            Serial.print(" (SHT40)"); break;
            }
            Serial.println();
            count++;
        } else if (err == 2 && (addr >= 0x3C && addr <= 0x3D)) {
            Serial.printf("  OLED range 0x%02X: NACK (err=%d)\n", addr, err);
        }
    }
    Serial.printf("[I2C] Done. %d device(s) found.\n", count);
    delay(500);
}

// ============================================================
//  Setup
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n==============================================");
    Serial.println(" PlantGuardian 硬件 Demo — ESP32-S3-N16R8");
    Serial.println("==============================================");

    // --- LED ---
    pinMode(PIN_LED_BUILTIN, OUTPUT);
    digitalWrite(PIN_LED_BUILTIN, LOW);

    // --- I²C ---
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setClock(50000);  // 50kHz for OLED stability
    delay(100);
    Serial.printf("[I2C] SDA=GPIO%d  SCL=GPIO%d\n", PIN_I2C_SDA, PIN_I2C_SCL);

    // I²C 扫描
    i2cScan();

    // --- 初始化 SHT40 ---
    if (sht4Init()) {
        Serial.println("[SHT40] OK");
    } else {
        Serial.println("[SHT40] FAIL - 检查接线");
    }

    // --- 初始化 BH1750 ---
    if (bh1750Init()) {
        Serial.println("[BH1750] OK");
    } else {
        Serial.println("[BH1750] FAIL - 检查地址/接线");
    }

    // --- OLED: minimal test ---
#if STAGE_OLED
    Wire.end();                      // reset bus
    delay(50);
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setClock(50000);
    delay(100);
    
    if (u8g2.begin()) {
        Serial.println("[OLED] OK");
        u8g2.setContrast(1);  // minimum brightness
        u8g2.clearBuffer();
        u8g2.setFont(u8g2_font_6x10_tf);
        u8g2.drawStr(5, 20, "OLED OK");
        u8g2.sendBuffer();
        Serial.println("[OLED] Done");
    } else {
        Serial.println("[OLED] FAIL");
    }
#endif

    // --- 初始化 ADC (土壤 + pH) ---
    analogReadResolution(12);  // ESP32-S3: 12-bit ADC
    Serial.printf("[ADC] Soil=GPIO%d, pH=GPIO%d\n", PIN_SOIL_MOISTURE, PIN_PH);

    // --- 初始化 TTS 串口 ---
#if STAGE_TTS
    TTS_Serial.begin(9600, SERIAL_8N1, PIN_TTS_RX, PIN_TTS_TX);
    Serial.printf("[TTS] UART1 RX=GPIO%d TX=GPIO%d @9600\n", PIN_TTS_RX, PIN_TTS_TX);
#endif

    Serial.println("--- Setup complete, entering loop ---\n");
}

// ============================================================
//  Main Loop
// ============================================================
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL_MS = 2000;  // 每 2 秒读一次

void loop() {
    unsigned long now = millis();
    if (now - lastSensorRead < SENSOR_INTERVAL_MS) return;
    lastSensorRead = now;

    // 1) 读所有传感器
    SensorData d = readAllSensors();

    // 2) 串口 CSV (Step 5 验收)
#if STAGE_SERIAL
    serialPrint(d);
#endif

    // 3) OLED - disabled: testing if one-time draw stays on
#if 0
    displayUpdate(d);
#endif

    // 4) TTS 播报 (Step 6b 验收)
#if STAGE_TTS
    ttsLoop(d);
#endif

    // 5) LED 心跳
    bool anySensorOK = d.sensorOK[0] || d.sensorOK[1] || d.sensorOK[2];
    ledIndicate(anySensorOK);
}
