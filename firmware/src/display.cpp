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

// ============================================================
//  浇水回馈：俏皮圆脸 + 单眼 wink + 媚眼（左眼看右）
// ============================================================
static void drawWateringWinkFrame(int frame) {
    const int cx = 64, cy = 34;

    u8g2.clearBuffer();
    u8g2.setDrawColor(1);

    // 圆脸轮廓
    u8g2.drawCircle(cx, cy, 22);
    u8g2.drawCircle(cx, cy, 21);

    // 害羞腮红
    u8g2.drawDisc(40, 40, 3);
    u8g2.drawDisc(88, 40, 3);

    const int eyeY   = 28;
    const int leftX  = 48;
    const int rightX = 80;

    // 左眼：大圆眼 + 瞳孔（frame 2~4 瞳孔略向右「抛媚眼」）
    int pupilShift = 0;
    if (frame >= 2 && frame <= 4) pupilShift = 4;
    u8g2.drawFilledEllipse(leftX, eyeY, 8, 10);
    u8g2.setDrawColor(0);
    u8g2.drawDisc(leftX + 1 + pupilShift, eyeY + 1, 4);
    u8g2.setDrawColor(1);
    u8g2.drawDisc(leftX + 3 + pupilShift, eyeY - 1, 2);

    // 右眉略挑（俏皮）
    if (frame >= 1) {
        u8g2.drawHLine(rightX - 10, eyeY - 12, 10);
        u8g2.drawHLine(rightX - 9, eyeY - 13, 8);
    }

    // 右眼：wink 序列
    u8g2.setDrawColor(1);
    if (frame <= 0) {
        u8g2.drawFilledEllipse(rightX, eyeY, 8, 10);
        u8g2.setDrawColor(0);
        u8g2.drawDisc(rightX + 1, eyeY + 1, 4);
        u8g2.setDrawColor(1);
        u8g2.drawDisc(rightX + 3, eyeY - 1, 2);
    } else if (frame == 1) {
        u8g2.drawFilledEllipse(rightX, eyeY, 8, 5);
        u8g2.setDrawColor(0);
        u8g2.drawDisc(rightX + 1, eyeY, 3);
        u8g2.setDrawColor(1);
    } else if (frame <= 4) {
        // 眯眼 wink
        u8g2.drawHLine(rightX - 10, eyeY, 20);
        u8g2.drawHLine(rightX - 10, eyeY + 1, 20);
        u8g2.drawHLine(rightX - 9, eyeY - 1, 18);
    } else {
        u8g2.drawFilledEllipse(rightX, eyeY, 8, 9);
        u8g2.setDrawColor(0);
        u8g2.drawDisc(rightX + 1, eyeY + 1, 4);
        u8g2.setDrawColor(1);
        u8g2.drawDisc(rightX + 3, eyeY - 1, 2);
    }

    // 小爱心（媚眼旁点缀）
    if (frame >= 2 && frame <= 4) {
        u8g2.drawDisc(98, 22, 2);
        u8g2.drawDisc(101, 22, 2);
        u8g2.drawTriangle(96, 24, 103, 24, 99, 28);
    }

    // 嘴巴：微笑略加大帧末
    int smileDrop = (frame >= 3) ? 1 : 0;
    u8g2.drawLine(48, 45 + smileDrop, 56, 51 + smileDrop);
    u8g2.drawLine(56, 51 + smileDrop, 72, 51 + smileDrop);
    u8g2.drawLine(72, 51 + smileDrop, 80, 45 + smileDrop);
    if (frame >= 3) {
        u8g2.drawPixel(64, 52 + smileDrop);
        u8g2.drawPixel(63, 53 + smileDrop);
        u8g2.drawPixel(65, 53 + smileDrop);
    }

    u8g2.setFont(u8g2_font_wqy12_t_gb2312a);
    u8g2.drawUTF8(34, 62, "喝饱啦~");
}

void displayWateringWink() {
    u8g2.setPowerSave(0);
    static const int kFrames = 6;
    for (int f = 0; f < kFrames; f++) {
        drawWateringWinkFrame(f);
        u8g2.sendBuffer();
        delay(95);
    }
    delay(180);
}

// ============================================================
//  稳定后环境播报：对称笑脸 + 略张开的嘴（像在说话）
// ============================================================
static unsigned long s_speakingSmileUntil = 0;

static void drawSpeakingSmileFace() {
    const int cx = 64, cy = 34;
    const int eyeY = 28, leftX = 48, rightX = 80;

    u8g2.clearBuffer();
    u8g2.setDrawColor(1);

    u8g2.drawCircle(cx, cy, 22);
    u8g2.drawCircle(cx, cy, 21);

    // 双眼：正常、对称
    u8g2.drawFilledEllipse(leftX, eyeY, 7, 9);
    u8g2.drawFilledEllipse(rightX, eyeY, 7, 9);
    u8g2.setDrawColor(0);
    u8g2.drawDisc(leftX + 1, eyeY + 1, 4);
    u8g2.drawDisc(rightX + 1, eyeY + 1, 4);
    u8g2.setDrawColor(1);
    u8g2.drawDisc(leftX + 2, eyeY - 2, 2);
    u8g2.drawDisc(rightX + 2, eyeY - 2, 2);

    // 微笑弧线（略宽）
    u8g2.drawLine(46, 44, 54, 50);
    u8g2.drawLine(54, 50, 74, 50);
    u8g2.drawLine(74, 50, 82, 44);
    u8g2.drawLine(48, 45, 56, 51);
    u8g2.drawLine(56, 51, 72, 51);
    u8g2.drawLine(72, 51, 80, 45);

    // 嘴部略张（像在念白）
    u8g2.setDrawColor(0);
    u8g2.drawFilledEllipse(64, 51, 5, 3);
    u8g2.setDrawColor(1);
    u8g2.drawPixel(60, 49);
    u8g2.drawPixel(68, 49);

    u8g2.setFont(u8g2_font_wqy12_t_gb2312a);
    u8g2.drawUTF8(38, 62, "播报中…");
}

void displayHoldSpeakingSmile(unsigned long durationMs, bool wifiConnected) {
    if (durationMs == 0) return;
    s_speakingSmileUntil = millis() + durationMs;
    u8g2.setPowerSave(0);
    u8g2.clearBuffer();
    drawSpeakingSmileFace();
    drawWifiIcon(wifiConnected);
    u8g2.sendBuffer();
}

void displayUpdate(const SensorData& d) {
    char buf[48];
    u8g2.setPowerSave(0);

    if (s_speakingSmileUntil != 0) {
        const unsigned long now = millis();
        if ((long)(now - s_speakingSmileUntil) < 0) {
            u8g2.clearBuffer();
            drawSpeakingSmileFace();
            drawWifiIcon(d.wifiConnected);
            u8g2.sendBuffer();
            return;
        }
        s_speakingSmileUntil = 0;
    }

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
void displayWateringWink() {}
void displayHoldSpeakingSmile(unsigned long, bool) {}

#endif
