#include "config.h"
#include "tts.h"

#if STAGE_TTS

#  include <HardwareSerial.h>

static HardwareSerial TTS_Serial(1);

void ttsInit() {
    TTS_Serial.begin(9600, SERIAL_8N1, PIN_TTS_RX, PIN_TTS_TX);
    Serial.printf("[TTS] UART1 RX=GPIO%d TX=GPIO%d @9600\n", PIN_TTS_RX, PIN_TTS_TX);
}

void ttsSpeak(const char* text) {
    size_t dataLen = strlen(text);
    size_t frameLen = 1 + dataLen;
    uint8_t xor_check = 0;
    TTS_Serial.write(0xFD);  xor_check ^= 0xFD;
    TTS_Serial.write((uint8_t)(frameLen >> 8));
    TTS_Serial.write((uint8_t)(frameLen & 0xFF));
    xor_check ^= (uint8_t)(frameLen >> 8);
    xor_check ^= (uint8_t)(frameLen & 0xFF);
    TTS_Serial.write(0x01);  xor_check ^= 0x01;
    for (size_t i = 0; i < dataLen; i++) {
        uint8_t c = (uint8_t)text[i];
        TTS_Serial.write(c);
        xor_check ^= c;
    }
#  if TTS_MODEL == TTS_MODEL_SYN6288
    TTS_Serial.write(xor_check);
#  endif
    TTS_Serial.flush();
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

#else  // STAGE_TTS == 0

void ttsInit() {}
void ttsSpeak(const char*) {}
void ttsLoop(const SensorData&) {}

#endif
