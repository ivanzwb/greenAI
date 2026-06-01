#pragma once

#include <stddef.h>
#include <stdint.h>

/** 将 UTF-8 转为 GBK 字节流，供 SYN6288「GBK」模式发送。仅含固件 TTS 文案用到的汉字与全角标点；无法映射的码点跳过。 */
size_t ttsUtf8ToGbk(const char* utf8, uint8_t* out, size_t maxOut);
