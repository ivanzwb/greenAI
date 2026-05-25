#pragma once
#include "sensors.h"

void wifiProvSetup();
void wifiProvLoop();
void uploadSensorData(const SensorData& d);
