#include <Arduino.h>
#include "i2c_utils.h"

// ============================================================
//  I²C 总线恢复：用 9 个 SCL 脉冲解锁被 slave 钉死 SDA 的情况
//  (SHT3x clock-stretch 超时后会卡住 SDA 低电平直到下个 STOP)
// ============================================================
void i2cBusRecover(int sdaPin, int sclPin) {
    pinMode(sdaPin, INPUT_PULLUP);
    pinMode(sclPin, OUTPUT);
    delayMicroseconds(10);
    if (digitalRead(sdaPin) == HIGH) {
        return;  // SDA 没被钉死，无需恢复
    }
    Serial.printf("[I2C] SDA(GPIO%d) stuck LOW, recovering...\n", sdaPin);
    for (int i = 0; i < 9; i++) {
        digitalWrite(sclPin, LOW);
        delayMicroseconds(5);
        digitalWrite(sclPin, HIGH);
        delayMicroseconds(5);
        if (digitalRead(sdaPin) == HIGH) {
            Serial.printf("[I2C] released after %d clocks\n", i + 1);
            break;
        }
    }
    // 发一个 STOP: SDA 低->高 while SCL 高
    pinMode(sdaPin, OUTPUT);
    digitalWrite(sdaPin, LOW);
    delayMicroseconds(5);
    digitalWrite(sclPin, HIGH);
    delayMicroseconds(5);
    digitalWrite(sdaPin, HIGH);
    delayMicroseconds(5);
    // 释放回输入态供 Wire 接管
    pinMode(sdaPin, INPUT);
    pinMode(sclPin, INPUT);
}
