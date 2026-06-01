#pragma once
#include "sensors.h"

void displayInit();
void displayBootAnimation();
void displayUpdate(const SensorData& d);
/** 浇水检测后的俏皮笑脸 / 抛媚眼小动画（与 TTS 搭配；无 OLED 时为空操作）。 */
void displayWateringWink();
/**
 * 在 durationMs 内 OLED 优先显示「正常说话」的笑脸（用于稳定后环境播报）。
 * wifiConnected 用于右上角 WiFi 角标。
 */
void displayHoldSpeakingSmile(unsigned long durationMs, bool wifiConnected);
