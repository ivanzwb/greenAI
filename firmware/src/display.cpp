#include "config.h"
#include "display.h"

#if STAGE_OLED

#  include <U8g2lib.h>

static U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, /*reset=*/U8X8_PIN_NONE);

void displayInit() {
    if (u8g2.begin()) {
        Serial.println("[OLED] init OK");
        u8g2.setPowerSave(0);
        u8g2.setContrast(255);
        u8g2.setFont(u8g2_font_6x10_tf);
        u8g2.clearBuffer();
        u8g2.drawStr(5, 20, "PlantGuardian");
        u8g2.drawStr(5, 40, "Booting...");
        u8g2.sendBuffer();
    } else {
        Serial.println("[OLED] FAIL");
    }
}

void displayUpdate(const SensorData& d) {
    char buf[32];
    u8g2.setPowerSave(0);
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.clearBuffer();

    if (d.sensorOK[0]) snprintf(buf, sizeof(buf), "T:%.1f C", d.temperature);
    else               snprintf(buf, sizeof(buf), "T:-- C");
    u8g2.drawUTF8(0, 14, buf);

    if (d.sensorOK[0]) snprintf(buf, sizeof(buf), "H:%.0f%%", d.humidity);
    else               snprintf(buf, sizeof(buf), "H:--%%");
    u8g2.drawUTF8(0, 29, buf);

    if (d.sensorOK[1]) snprintf(buf, sizeof(buf), "L:%.0f lx", d.lux);
    else               snprintf(buf, sizeof(buf), "L:-- lx");
    u8g2.drawUTF8(0, 44, buf);

    if (d.sensorOK[2]) {
#  if STAGE_PH
        if (d.sensorOK[3]) snprintf(buf, sizeof(buf), "Soil:%d pH:%.1f", d.soilPercent, d.pH);
        else               snprintf(buf, sizeof(buf), "Soil:%d pH:--", d.soilPercent);
#  else
        snprintf(buf, sizeof(buf), "Soil:%d", d.soilPercent);
#  endif
    } else {
        snprintf(buf, sizeof(buf), "Soil:--");
    }
    u8g2.drawUTF8(0, 59, buf);

    u8g2.sendBuffer();
}

#else  // STAGE_OLED == 0

void displayInit() {}
void displayUpdate(const SensorData&) {}

#endif
