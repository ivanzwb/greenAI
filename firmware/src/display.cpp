#include "config.h"
#include "display.h"

#if STAGE_OLED

#  include <U8g2lib.h>

static U8G2_SSD1306_128X64_NONAME_F_HW_I2C u8g2(U8G2_R0, /*reset=*/U8X8_PIN_NONE);

// ============================================================
//  WiFi 状态图标 (右上角) — XBM 位图，16×12
// ============================================================
// 像素布局 (#=点亮)：
//   ....OOOOOOOO....    外圈
//   ..OO........OO..
//   OO............OO
//   ......OOOO......    中圈
//   ....OO....OO....
//   ...O........O...
//   .......OO.......    内圈
//   ......O..O......
//   ................
//   .......OO.......    天线点
//   .......OO.......
//   ................
#define WIFI_W 16
#define WIFI_H 12
static const uint8_t wifi_full_bits[] PROGMEM = {
    0xF0, 0x0F,   // row 0
    0x0C, 0x30,   // row 1
    0x03, 0xC0,   // row 2
    0xC0, 0x03,   // row 3
    0x30, 0x0C,   // row 4
    0x08, 0x10,   // row 5
    0x80, 0x01,   // row 6
    0x40, 0x02,   // row 7
    0x00, 0x00,   // row 8
    0x80, 0x01,   // row 9
    0x80, 0x01,   // row 10
    0x00, 0x00,   // row 11
};

static void drawWifiIcon(bool connected) {
    // 右上角；图标左上角 (x, y) = (110, 0)
    const int ix = 110, iy = 0;
    u8g2.drawXBMP(ix, iy, WIFI_W, WIFI_H, wifi_full_bits);

    if (!connected) {
        // 斜杠贯穿图标 (左下→右上)
        u8g2.drawLine(ix + 1, iy + WIFI_H - 1, ix + WIFI_W - 2, iy + 1);
        u8g2.drawLine(ix + 2, iy + WIFI_H - 1, ix + WIFI_W - 1, iy + 1);
    }
}

void displayInit() {
    if (u8g2.begin()) {
        Serial.println("[OLED] init OK");
        u8g2.setPowerSave(0);
        u8g2.setContrast(255);
        u8g2.enableUTF8Print();
        u8g2.clearBuffer();
        // 中文字体 (wqy12 GB2312 子集)
        u8g2.setFont(u8g2_font_wqy12_t_gb2312a);
        u8g2.drawUTF8(20, 28, "植物管家");
        u8g2.drawUTF8(28, 50, "启动中...");
        u8g2.sendBuffer();
    } else {
        Serial.println("[OLED] FAIL");
    }
}

// ============================================================
//  开机眨眼动画：上半屏两只大眼睛 blink，下半屏保留 "植物管家"
// ============================================================
static void drawBootFrame(int eyeRy) {
    const int eyeCY   = 22;          // 眼睛中心 Y
    const int leftCX  = 40;          // 左眼中心 X
    const int rightCX = 88;          // 右眼中心 X
    const int eyeRx   = 20;          // 眼睛水平半径

    u8g2.clearBuffer();

    // --- 眼白 ---
    u8g2.setDrawColor(1);
    if (eyeRy <= 1) {
        // 闭眼：画一条粗横线代替椭圆 (drawFilledEllipse ry=0 不画)
        u8g2.drawHLine(leftCX  - eyeRx, eyeCY, eyeRx * 2);
        u8g2.drawHLine(leftCX  - eyeRx, eyeCY + 1, eyeRx * 2);
        u8g2.drawHLine(rightCX - eyeRx, eyeCY, eyeRx * 2);
        u8g2.drawHLine(rightCX - eyeRx, eyeCY + 1, eyeRx * 2);
    } else {
        u8g2.drawFilledEllipse(leftCX,  eyeCY, eyeRx, eyeRy);
        u8g2.drawFilledEllipse(rightCX, eyeCY, eyeRx, eyeRy);

        // --- 瞳孔 (眼睛足够睁开才画) ---
        if (eyeRy >= 10) {
            u8g2.setDrawColor(0);
            u8g2.drawDisc(leftCX  + 3, eyeCY, 6);
            u8g2.drawDisc(rightCX + 3, eyeCY, 6);
            // 高光小点
            u8g2.setDrawColor(1);
            u8g2.drawDisc(leftCX  + 5, eyeCY - 3, 2);
            u8g2.drawDisc(rightCX + 5, eyeCY - 3, 2);
        }
    }

    // --- 底部文字 ---
    u8g2.setDrawColor(1);
    u8g2.setFont(u8g2_font_wqy12_t_gb2312a);
    u8g2.drawUTF8(40, 62, "植物管家");

    u8g2.sendBuffer();
}

void displayBootAnimation() {
    // 眨眼帧序列：睁→慢慢闭→闭→睁，重复 3 次，最后留在睁眼
    static const int blinkFrames[] = {
        20, 20, 20, 20,        // 完全睁开停留
        16, 11, 6, 2, 0,       // 闭合
        0, 0,                  // 闭眼保持
        2, 6, 11, 16, 20,      // 张开
    };
    const int frameCount = sizeof(blinkFrames) / sizeof(blinkFrames[0]);
    const int blinkLoops = 3;

    for (int loop = 0; loop < blinkLoops; loop++) {
        for (int i = 0; i < frameCount; i++) {
            drawBootFrame(blinkFrames[i]);
            delay(45);
        }
    }
    // 收尾停留一下，让用户看到完全张开的眼睛
    drawBootFrame(20);
    delay(300);
}

void displayUpdate(const SensorData& d) {
    char buf[48];
    u8g2.setPowerSave(0);
    u8g2.setFont(u8g2_font_wqy12_t_gb2312a);   // 中文 + ASCII 同字体
    u8g2.clearBuffer();

    // 第 1 行: 温度
    if (d.sensorOK[0]) snprintf(buf, sizeof(buf), "温度: %.1f℃", d.temperature);
    else               snprintf(buf, sizeof(buf), "温度: --");
    u8g2.drawUTF8(0, 14, buf);

    // 第 2 行: 湿度
    if (d.sensorOK[0]) snprintf(buf, sizeof(buf), "湿度: %.0f%%", d.humidity);
    else               snprintf(buf, sizeof(buf), "湿度: --");
    u8g2.drawUTF8(0, 28, buf);

    // 第 3 行: 光照
    if (d.sensorOK[1]) snprintf(buf, sizeof(buf), "光照: %.0f lx", d.lux);
    else               snprintf(buf, sizeof(buf), "光照: --");
    u8g2.drawUTF8(0, 42, buf);

    // 第 4 行: 土壤 + pH (合并显示)
    if (d.sensorOK[2]) {
#  if STAGE_PH
        if (d.sensorOK[3]) snprintf(buf, sizeof(buf), "土壤: %d%% pH: %.1f", d.soilPercent, d.pH);
        else               snprintf(buf, sizeof(buf), "土壤: %d%% pH: --", d.soilPercent);
#  else
        snprintf(buf, sizeof(buf), "土壤: %d%%", d.soilPercent);
#  endif
    } else {
        snprintf(buf, sizeof(buf), "土壤: --");
    }
    u8g2.drawUTF8(0, 56, buf);

    drawWifiIcon(d.wifiConnected);

    u8g2.sendBuffer();
}

#else  // STAGE_OLED == 0

void displayInit() {}
void displayBootAnimation() {}
void displayUpdate(const SensorData&) {}

#endif
