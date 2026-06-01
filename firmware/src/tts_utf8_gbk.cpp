#include "tts_utf8_gbk.h"

#include <cstring>

// Unicode -> GBK (高字节在前)，按 code point 升序，供二分查找。
//
// 须覆盖的「原文」均在固件源码中（改文案时请同步补表，并跑仓库根: npm run verify:tts-gbk）：
//   main.cpp     — ttsSpeak("植物管家已启动");
//   tts.cpp      — WATERING_DEFAULT_MSG（默认浇水句）
//   tts.cpp      — strcat(fullText, "...") 环境播报片段："当前环境" "温度" "摄氏度" "湿度" "百分之" "盆土湿度" "酸碱度"
// 以下若干字（欢/迎/使/用/语/音/合/成/模/块/成）为扩展预留，便于自行对照 LU6288 等示例做串口实验，不参与当前 verify 字面量集合。
// NVS waterMsg 可由用户自定义；表外汉字会被跳过，可能导致静音或语义残缺。
static const uint32_t kCp[] = {
    0x3002, 0x4E00, 0x4E4B, 0x4F60, 0x4F7F, 0x5206, 0x524D, 0x52A8, 0x5408, 0x542F, 0x5462, 0x571F, 0x5757, 0x5883,
    0x5BB6, 0x5DF2, 0x5E26, 0x5EA6, 0x5F53, 0x5F97, 0x6210, 0x6211, 0x6444, 0x690D, 0x6A21, 0x6B22, 0x6BCF, 0x6C0F,
    0x6C34, 0x6E29, 0x6E7F, 0x6EF4, 0x7269, 0x73AF, 0x7528, 0x767E, 0x7684, 0x7740, 0x76C6, 0x78B1, 0x7BA1, 0x8BB0,
    0x8BED, 0x8C22, 0x8FCE, 0x90FD, 0x9178, 0x97F3, 0xFF0C,
};
static const uint16_t kGbk[] = {
    0xA1A3, 0xD2BB, 0xD6AE, 0xC4E3, 0xCAB9, 0xB7D6, 0xC7B0, 0xB6AF, 0xBACF, 0xC6F4, 0xC4D8, 0xCDBF, 0xBFE9, 0xBEF9,
    0xBCD2, 0xD2D1, 0xB4F8, 0xB6C8, 0xB5B1, 0xB5C3, 0xB3C9, 0xCED2, 0xC9E3, 0xD6B2, 0xC4A3, 0xBBB6, 0xC3BF, 0xCAC7,
    0xCBAE, 0xCEC2, 0xCAAA, 0xB5CE, 0xCEEF, 0xBBB7, 0xD3C3, 0xB0D9, 0xB5C4, 0xD5C5, 0xC5E8, 0xBCE1, 0xB9DC, 0xBCC7,
    0xD3EF, 0xD0BB, 0xD3AD, 0xB6BC, 0xCBD8, 0xD2F4, 0xA3AC,
};

static_assert(sizeof(kCp) / sizeof(kCp[0]) == sizeof(kGbk) / sizeof(kGbk[0]), "cp/gbk table mismatch");

static uint16_t lookupGbk(uint32_t cp) {
    size_t lo = 0, hi = sizeof(kCp) / sizeof(kCp[0]);
    while (lo < hi) {
        size_t mid = (lo + hi) / 2;
        if (kCp[mid] == cp) return kGbk[mid];
        if (kCp[mid] < cp)
            lo = mid + 1;
        else
            hi = mid;
    }
    return 0;
}

size_t ttsUtf8ToGbk(const char* utf8, uint8_t* out, size_t maxOut) {
    if (!utf8 || !out || maxOut == 0) return 0;

    size_t o = 0;
    const auto* p = reinterpret_cast<const uint8_t*>(utf8);

    while (*p != 0) {
        if (*p < 0x80u) {
            if (o >= maxOut) return 0;
            out[o++] = *p++;
            continue;
        }

        uint32_t cp = 0;
        if ((p[0] & 0xE0u) == 0xC0u && p[1] != 0) {
            cp = ((uint32_t)(p[0] & 0x1Fu) << 6) | (p[1] & 0x3Fu);
            p += 2;
        } else if ((p[0] & 0xF0u) == 0xE0u && p[1] != 0 && p[2] != 0) {
            cp = ((uint32_t)(p[0] & 0x0Fu) << 12) | ((uint32_t)(p[1] & 0x3Fu) << 6) | (uint32_t)(p[2] & 0x3Fu);
            p += 3;
        } else if ((p[0] & 0xF8u) == 0xF0u) {
            // 未在映射表支持；跳过首字节以免死循环
            ++p;
            continue;
        } else {
            ++p;
            continue;
        }

        if (cp < 0x80u) {
            if (o >= maxOut) return 0;
            out[o++] = (uint8_t)cp;
            continue;
        }

        uint16_t g = lookupGbk(cp);
        if (g == 0) continue;
        if (o + 2u > maxOut) return 0;
        out[o++] = (uint8_t)((g >> 8) & 0xFFu);
        out[o++] = (uint8_t)(g & 0xFFu);
    }
    return o;
}
