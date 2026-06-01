#pragma once
#include "sensors.h"

void ttsInit();
void ttsSpeak(const char* text);
/** 上电后：温湿度读数稳定（或超时）时只播报一次环境数据，之后不再周期播报。 */
void ttsLoop(const SensorData& d);

// 浇水回馈：从 NVS 读 (namespace=plantguard, key=waterMsg)，
// 没设置就用默认句。下次小程序写入后会自动失效缓存重新读取。
void ttsSpeakWatering();
void ttsInvalidateConfig();
