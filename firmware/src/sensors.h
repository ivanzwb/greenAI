#pragma once
#include <Arduino.h>

struct SensorData {
    float temperature = NAN;
    float humidity    = NAN;
    float lux         = NAN;
    int   soilRaw     = 0;
    int   soilPercent = 0;   // 0..100，与 test_soil / 云端 soilMoisture 一致
    int   phRaw       = 0;
    float pH          = NAN;
    bool  sensorOK[4] = {false, false, false, false}; // SHT/BH/Soil/pH
    bool  wifiConnected = false;
};

extern bool g_sht3xAvailable;
extern bool g_bh1750Available;

bool     initSensors();
SensorData readAllSensors();
