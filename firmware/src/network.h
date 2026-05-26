#pragma once
#include "sensors.h"

void wifiProvSetup();
void wifiProvLoop();
void uploadSensorData(const SensorData& d);
bool wifiIsConnected();

// Clear saved WiFi credentials from NVS. Caller should ESP.restart() after.
void wifiClearCreds();
