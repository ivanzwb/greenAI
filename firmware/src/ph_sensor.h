#pragma once

#include <Arduino.h>

bool phRawLooksValid(int raw);

// DFRobot 官方：10 次采样、排序、中间 6 点平均 → pH
bool phReadOfficial(int* rawAvgOut, float* phOut);
