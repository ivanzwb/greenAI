#pragma once
#include "sensors.h"

void ttsInit();
void ttsSpeak(const char* text);
void ttsLoop(const SensorData& d);

// 浇水回馈：从 NVS 读 (namespace=plantguard, key=waterMsg)，
// 没设置就用默认句。下次小程序写入后会自动失效缓存重新读取。
void ttsSpeakWatering();
void ttsInvalidateConfig();
