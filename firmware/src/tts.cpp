#include "config.h"
#include "tts.h"

#if STAGE_TTS

#  include <HardwareSerial.h>
#  include <Preferences.h>

static HardwareSerial TTS_Serial(1);

// ---- 浇水回馈文案 (NVS 缓存) ----
static const char* WATERING_DEFAULT_MSG =
    "谢谢你记得我，每一滴水都带着你的温度呢。";
static String g_waterMsg;
static bool   g_waterMsgLoaded = false;

void ttsInit() {
    TTS_Serial.begin(9600, SERIAL_8N1, PIN_TTS_RX, PIN_TTS_TX);
    Serial.printf("[TTS] UART1 RX=GPIO%d TX=GPIO%d @9600\n", PIN_TTS_RX, PIN_TTS_TX);
}

void ttsSpeak(const char* text) {
    // SYN6288 / XFS5152 通用合成帧:
    //   0xFD | LEN_H | LEN_L | 0x01(cmd) | 0x03(编码=UTF-8) | text... | XOR
    //   LEN = cmd(1) + param(1) + textLen + xor(1) = textLen + 3
    size_t  textLen  = strlen(text);
    uint16_t frameLen = (uint16_t)(textLen + 3);
    uint8_t  xorCheck = 0;

    uint8_t b;
    b = 0xFD;                             TTS_Serial.write(b); xorCheck ^= b;
    b = (uint8_t)(frameLen >> 8);         TTS_Serial.write(b); xorCheck ^= b;
    b = (uint8_t)(frameLen & 0xFF);       TTS_Serial.write(b); xorCheck ^= b;
    b = 0x01;                             TTS_Serial.write(b); xorCheck ^= b;  // 命令字：合成
    b = 0x03;                             TTS_Serial.write(b); xorCheck ^= b;  // 参数：背景音乐关 + UTF-8

    for (size_t i = 0; i < textLen; i++) {
        uint8_t c = (uint8_t)text[i];
        TTS_Serial.write(c);
        xorCheck ^= c;
    }
    TTS_Serial.write(xorCheck);
    TTS_Serial.flush();
    Serial.printf("[TTS] speak: \"%s\" (%u bytes)\n", text, (unsigned)textLen);
}

static unsigned long lastTTSMillis = 0;
static const unsigned long TTS_INTERVAL_MS = 60000;

void ttsLoop(const SensorData& d) {
    unsigned long now = millis();
    if (now - lastTTSMillis < TTS_INTERVAL_MS && lastTTSMillis != 0) return;
    lastTTSMillis = now;

    char numBuf[16];
    char fullText[128] = {0};
    strcat(fullText, "当前环境");
    if (d.sensorOK[0]) {
        dtostrf(d.temperature, 1, 1, numBuf);
        strcat(fullText, "温度");  strcat(fullText, numBuf);  strcat(fullText, "摄氏度");
        dtostrf(d.humidity, 1, 0, numBuf);
        strcat(fullText, "湿度");  strcat(fullText, numBuf);  strcat(fullText, "百分之");
    }
    if (d.sensorOK[2]) {
        snprintf(numBuf, sizeof(numBuf), "%d", d.soilPercent);
        strcat(fullText, "盆土湿度");  strcat(fullText, numBuf);
    }
#  if STAGE_PH
    if (d.sensorOK[3]) {
        dtostrf(d.pH, 1, 1, numBuf);
        strcat(fullText, "酸碱度");  strcat(fullText, numBuf);
    }
#  endif
    ttsSpeak(fullText);
}

// ============================================================
//  浇水回馈
// ============================================================
void ttsInvalidateConfig() {
    g_waterMsgLoaded = false;
}

void ttsSpeakWatering() {
    if (!g_waterMsgLoaded) {
        Preferences p;
        if (p.begin("plantguard", /*readOnly=*/true)) {
            g_waterMsg = p.getString("waterMsg", WATERING_DEFAULT_MSG);
            p.end();
        } else {
            g_waterMsg = WATERING_DEFAULT_MSG;
        }
        if (g_waterMsg.length() == 0) g_waterMsg = WATERING_DEFAULT_MSG;
        g_waterMsgLoaded = true;
        Serial.printf("[WATER] msg=\"%s\"\n", g_waterMsg.c_str());
    }
    ttsSpeak(g_waterMsg.c_str());
}

#else  // STAGE_TTS == 0

void ttsInit() {}
void ttsSpeak(const char*) {}
void ttsLoop(const SensorData&) {}
void ttsSpeakWatering() {}
void ttsInvalidateConfig() {}

#endif
