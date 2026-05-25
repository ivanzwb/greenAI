#pragma once
#include "sensors.h"

void ttsInit();
void ttsSpeak(const char* text);
void ttsLoop(const SensorData& d);
