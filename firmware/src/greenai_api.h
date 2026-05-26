#pragma once

#include <Arduino.h>
#include <Preferences.h>

#include "sensors.h"

/** 从 NVS 读取 API Base、userId、sensorKey、plantId（配网页提交后写入）。 */
void greenaiReloadConfig(Preferences& prefs);

/** 已配置 apiBase + userId + sensorKey（plantId 可选）。 */
bool greenaiIsConfigured();

/**
 * STA 联网且 NTP 可用时，用 NVS 中的 bindCode 调用 POST /devices/claim-binding-code，
 * 写入 userId / sensorKey 并清除 bindCode（与小程序「生成绑定码」闭环）。
 */
void greenaiTryClaimBindingCode(Preferences& prefs);

/**
 * 按间隔上报传感器读数到 POST /internal/sensors/ingest（HMAC）。
 * @param nowMillis loop 中的 millis()
 */
void greenaiMaybePostSensor(const SensorData& d, unsigned long nowMillis);

/**
 * 尝试发送队列中的设备日志到 POST /internal/sensors/logs（与读数共用签名）。
 * 在传感器上报前后均可调用；内部有节流。
 */
void greenaiFlushLogs(unsigned long nowMillis);

/** 入队一条日志（WiFi 未连或配置不全时丢弃）。 */
void greenaiLog(const char* level, const char* message);

/** 上电后 WiFi 就绪时调用一次，写入 boot 标记（内部仅执行一次）。 */
void greenaiMarkBootOnce();
