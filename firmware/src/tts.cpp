#include "config.h"
#include "tts.h"

#if STAGE_TTS

#  include <HardwareSerial.h>
#  include <Preferences.h>
#  include <cmath>
#  include <cstring>

#  include "display.h"
#  include "tts_utf8_gbk.h"

static HardwareSerial TTS_Serial(1);

// ---- LU6288：与 firmware/test-voice-lu6288/src/main.cpp 同源（9600、标记串、延时）----
static void lu6288MusicOff() {
    TTS_Serial.print("<M>0");
    delay(50);
    TTS_Serial.flush();
}

/** 发送 GBK 正文（不含 <G> 前缀）；内部先 <M>0 再 <G>+payload，同 test 中「关背景音乐后播合成串」顺序。 */
static void lu6288SpeakGbkPayload(const uint8_t* gbk, size_t len) {
    lu6288MusicOff();
    TTS_Serial.print("<G>");
    for (size_t i = 0; i < len; i++) TTS_Serial.write(gbk[i]);
    TTS_Serial.flush();
}

#  if TTS_DEBUG_MODULE_RX
static void ttsDrainModuleRx() {
    while (TTS_Serial.available()) (void)TTS_Serial.read();
}

static void ttsLogModuleRx(unsigned waitMs) {
    delay(15);
    uint8_t buf[40];
    size_t  n = 0;
    unsigned long t0 = millis();
    while (millis() - t0 < waitMs && n < sizeof(buf)) {
        int c = TTS_Serial.read();
        if (c >= 0)
            buf[n++] = (uint8_t)c;
        else
            delay(1);
    }
    if (n == 0) {
        Serial.println("[TTS] module RX: (no bytes — TX→GPIO18? 共地? 供电?)");
        return;
    }
    Serial.printf("[TTS] module RX (%u B): ", (unsigned)n);
    for (size_t i = 0; i < n; i++) Serial.printf("%02X ", buf[i]);
    Serial.println();
}
#  endif

// ---- 浇水回馈文案 (NVS 缓存) ----
static const char* WATERING_DEFAULT_MSG =
    "谢谢你记得我，每一滴水都带着你的温度呢。";
static String g_waterMsg;
static bool   g_waterMsgLoaded = false;

void ttsInit() {
    TTS_Serial.begin(9600, SERIAL_8N1, PIN_TTS_RX, PIN_TTS_TX);
    Serial.printf("[TTS] LU6288 UART1 RX=GPIO%d TX=GPIO%d @9600 (cf. test-voice-lu6288)\n", PIN_TTS_RX, PIN_TTS_TX);
    // 与测试工程 loop 前一致：先关背景音乐，避免误码后卡「唱歌」
    delay(100);
    lu6288MusicOff();
#  if TTS_DEBUG_MODULE_RX
    ttsDrainModuleRx();
#  endif
}

void ttsSpeak(const char* text) {
#  if TTS_DEBUG_MODULE_RX
    ttsDrainModuleRx();
#  endif
    uint8_t payload[220];
    size_t payLen = ttsUtf8ToGbk(text, payload, sizeof(payload));
    if (payLen == 0) {
        Serial.println("[TTS] speak skipped: empty after UTF-8→GBK (check mapping table / input)");
        return;
    }
    if (payLen > 200) payLen = 200;

    lu6288SpeakGbkPayload(payload, payLen);
    Serial.printf("[TTS] LU6288 speak GBK %u B (UTF-8 src len=%u)\n", (unsigned)payLen, (unsigned)strlen(text));
#  if TTS_DEBUG_MODULE_RX
    ttsLogModuleRx(100);
#  endif
}

// ---- 上电后仅播报一次环境读数：SHT 有效且温度连续若干帧变化很小视为「稳定」；
//     超时则只要有温湿度也播报一次，避免永远等不到稳定。----
static bool          s_envAnnounced     = false;
static float         s_lastStableT    = NAN;
static uint8_t       s_tempStableCnt  = 0;
static unsigned long s_envWaitStartMs = 0;

static void ttsSpeakEnvironmentOnce(const SensorData& d) {
    char numBuf[16];
    char fullText[128] = {0};
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
#  if STAGE_PH
    if (d.sensorOK[3]) {
        dtostrf(d.pH, 1, 1, numBuf);
        strcat(fullText, "酸碱度");
        strcat(fullText, numBuf);
    }
#  endif
    size_t textLen = strlen(fullText);
    unsigned long holdMs = 5500UL + (unsigned long)textLen * 100UL;
    if (holdMs < 8000UL) holdMs = 8000UL;
    if (holdMs > 24000UL) holdMs = 24000UL;
#  if STAGE_OLED
    displayHoldSpeakingSmile(holdMs, d.wifiConnected);
#  endif
    ttsSpeak(fullText);
}

void ttsLoop(const SensorData& d) {
    if (s_envAnnounced) return;

    if (s_envWaitStartMs == 0) s_envWaitStartMs = millis();

    if (!d.sensorOK[0]) {
        s_lastStableT   = NAN;
        s_tempStableCnt = 0;
        return;
    }

    const float tNow = d.temperature;
    if (isnan(s_lastStableT)) {
        s_lastStableT = tNow;
        s_tempStableCnt = 1;
    } else {
        if (fabs(tNow - s_lastStableT) < 0.5f)
            s_tempStableCnt++;
        else
            s_tempStableCnt = 1;
        s_lastStableT = tNow;
    }

    const bool stableEnough = (s_tempStableCnt >= 4);
    const bool timeoutFallback =
        (millis() - s_envWaitStartMs > 25000UL) && d.sensorOK[0];

    if (stableEnough || timeoutFallback) {
        s_envAnnounced = true;
        Serial.printf("[TTS] env one-shot (stable=%d timeout=%d)\n", stableEnough ? 1 : 0,
                      timeoutFallback && !stableEnough ? 1 : 0);
        ttsSpeakEnvironmentOnce(d);
    }
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
            if (p.isKey("waterMsg")) g_waterMsg = p.getString("waterMsg", "");
            else g_waterMsg = WATERING_DEFAULT_MSG;
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
