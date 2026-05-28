// ============================================================
//  土壤湿度传感器独立测试程序
//  目标：排除主固件干扰，看裸 ADC 读数是否稳定
// ============================================================
#include <Arduino.h>
#include "../../src/config.h"

// 标定常量与换算逻辑与主固件 sensors.cpp 共用 config.h

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println();
    Serial.println("=== Soil sensor standalone test ===");
    Serial.printf("Sensor pin: GPIO%d\n", PIN_SOIL_MOISTURE);

    analogReadResolution(12);            // 0..4095
    analogSetAttenuation(ADC_11db);      // 量程约 0..3.3V
    Serial.println("ADC: 12-bit, 11dB");
    Serial.println("-----------------------------------");
}

void loop() {
    int rawValue  = analogRead(PIN_SOIL_MOISTURE);
    float voltage = rawValue * (3.3f / 4095.0f);

    int moisture = map(rawValue, SOIL_ADC_DRY, SOIL_ADC_WET, 0, 100);
    moisture     = constrain(moisture, 0, 100);

    Serial.printf("原始值: %4d | 电压: %.2fV | 土壤湿度: %3d%%",
                  rawValue, voltage, moisture);

    if (moisture >= 70)       Serial.println(" | 状态: 很湿");
    else if (moisture >= 35)  Serial.println(" | 状态: 适中");
    else if (moisture >= 15)  Serial.println(" | 状态: 偏干");
    else                      Serial.println(" | 状态: 很干，考虑浇水");

    Serial.println("--------------------");
    delay(1000);
}
