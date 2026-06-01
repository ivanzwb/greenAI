#include "greenai_api.h"

#include <HTTPClient.h>
#include <WiFi.h>
#include <cstring>
#include <time.h>

#include <mbedtls/md.h>
#include <mbedtls/sha256.h>

#include "config.h"
#include "tts.h"

// ---- NVS 配置（配网写 apiBase/bindCode；claim 写 sensorKey 并清 bindCode）----
static String g_apiBase;
static String g_sensorKey;
static String g_bindCode;

static unsigned long g_lastSensorPostMs = 0;
static const unsigned long SENSOR_POST_INTERVAL_MS = 15000UL;

static unsigned long g_lastLogFlushMs = 0;
static const unsigned long LOG_FLUSH_MIN_MS = 8000UL;

// ---- 设备配置周期拉取 ----
static unsigned long g_lastConfigFetchMs = 0;
static const unsigned long CONFIG_FETCH_INTERVAL_MS = 5UL * 60UL * 1000UL;  // 5 分钟

#define LOGQ 10
#define LOGLEN 180
static char g_logLevels[LOGQ][12];
static char g_logMsgs[LOGQ][LOGLEN];
static int  g_logCount = 0;

static bool g_bootEnqueued = false;

/** 避免键不存在时 Preferences::getString 触发 ESP-IDF NVS ERROR 日志 */
static String prefStringOrEmpty(Preferences& prefs, const char* key) {
  if (!prefs.isKey(key)) return String();
  return prefs.getString(key, "");
}

void greenaiReloadConfig(Preferences& prefs) {
  g_apiBase   = prefStringOrEmpty(prefs, "apiBase");
  g_sensorKey = prefStringOrEmpty(prefs, "sensorKey");
  g_bindCode  = prefStringOrEmpty(prefs, "bindCode");
  while (g_apiBase.length() && g_apiBase.endsWith("/"))
    g_apiBase.remove(g_apiBase.length() - 1);
}

bool greenaiIsConfigured() {
  return g_apiBase.length() > 0 && g_sensorKey.length() >= 16;
}

static String hardwareId() {
  String m = WiFi.macAddress();
  m.replace(":", "");
  m.toLowerCase();
  return String("esp32-") + m;
}

static void sha256HexUtf8(const String& data, char outHex[65]) {
  unsigned char hash[32];
  mbedtls_sha256_context ctx;
  mbedtls_sha256_init(&ctx);
  mbedtls_sha256_starts(&ctx, 0);
  mbedtls_sha256_update(&ctx, reinterpret_cast<const unsigned char*>(data.c_str()), data.length());
  mbedtls_sha256_finish(&ctx, hash);
  mbedtls_sha256_free(&ctx);
  static const char* hx = "0123456789abcdef";
  for (int i = 0; i < 32; i++) {
    outHex[i * 2]     = hx[hash[i] >> 4];
    outHex[i * 2 + 1] = hx[hash[i] & 15];
  }
  outHex[64] = '\0';
}

static void hmacSha256Hex(const String& message, const String& secret, char outHex[65]) {
  const mbedtls_md_info_t* md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  unsigned char mac[32];
  mbedtls_md_hmac(md, reinterpret_cast<const unsigned char*>(secret.c_str()), secret.length(),
                  reinterpret_cast<const unsigned char*>(message.c_str()), message.length(), mac);
  static const char* hx = "0123456789abcdef";
  for (int i = 0; i < 32; i++) {
    outHex[i * 2]     = hx[mac[i] >> 4];
    outHex[i * 2 + 1] = hx[mac[i] & 15];
  }
  outHex[64] = '\0';
}

static bool ensureNetworkTime() {
  static bool ntpStarted = false;
  if (!ntpStarted) {
    ntpStarted = true;
    configTime(8 * 3600, 0, "ntp.aliyun.com", "pool.ntp.org", "cn.pool.ntp.org");
  }
  time_t t = time(nullptr);
  return t > 1700000000;
}

/** 解析 claim 返回 JSON 中的字符串字段（简单扫描，无完整 JSON 依赖）。 */
static bool extractJsonStringField(const String& json, const char* key, String& out) {
  String pat = String("\"") + key + String("\":\"");
  int i = json.indexOf(pat);
  if (i < 0) return false;
  i += pat.length();
  out = "";
  for (; i < (int)json.length(); ++i) {
    char c = json.charAt(i);
    if (c == '\\') {
      ++i;
      if (i < (int)json.length()) out += json.charAt(i);
      continue;
    }
    if (c == '"') break;
    out += c;
  }
  return out.length() > 0;
}

void greenaiTryClaimBindingCode(Preferences& prefs) {
  greenaiReloadConfig(prefs);
  if (g_apiBase.length() == 0 || g_bindCode.length() < 8) return;
  if (g_sensorKey.length() >= 16) return;
  if (!WiFi.isConnected()) return;
  if (!ensureNetworkTime()) return;

  const String hid = hardwareId();
  const String body =
      String("{\"code\":\"") + g_bindCode + String("\",\"hardwareId\":\"") + hid + String("\"}");

  HTTPClient http;
  http.setTimeout(25000);
  const String url = g_apiBase + "/devices/claim-binding-code";
  if (!http.begin(url)) {
    greenaiLog("warn", "claim_begin_fail");
    return;
  }
  http.addHeader("Content-Type", "application/json");
  const int code = http.POST(body);
  const String resp = http.getString();
  http.end();

  if (code >= 200 && code < 300) {
    String sk;
    if (extractJsonStringField(resp, "sensorKey", sk) && sk.length() >= 16) {
      prefs.putString("sensorKey", sk);
    }
    prefs.remove("bindCode");
    greenaiReloadConfig(prefs);
    greenaiLog("info", "claim_ok");
  } else {
    char buf[72];
    snprintf(buf, sizeof buf, "claim_http_%d", code);
    greenaiLog("warn", buf);
  }
}

/** 与后端 verifyDeviceIngestHmac 一致：message = ts + "\\n" + sha256_hex(body) */
static bool postJsonSigned(const String& path, const String& jsonBody, int& httpCode, String& err,
                           String* respOut = nullptr) {
  if (!greenaiIsConfigured()) {
    err = "not_configured";
    return false;
  }
  if (!ensureNetworkTime()) {
    err = "ntp_pending";
    return false;
  }

  time_t tsSec = time(nullptr);
  String tsStr = String(static_cast<long>(tsSec));

  char bodyHashHex[65];
  sha256HexUtf8(jsonBody, bodyHashHex);

  String msg = tsStr + "\n" + String(bodyHashHex);
  char sigHex[65];
  hmacSha256Hex(msg, g_sensorKey, sigHex);

  String url = g_apiBase + path;
  HTTPClient http;
  http.setTimeout(20000);
  if (!http.begin(url)) {
    err = "begin_failed";
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-timestamp", tsStr);
  http.addHeader("x-signature", String(sigHex));

  httpCode = http.POST(jsonBody);
  if (httpCode <= 0) {
    err = http.errorToString(httpCode);
  } else if (respOut) {
    *respOut = http.getString();
  }
  http.end();
  return httpCode > 0;
}

static String jsonEscape(const char* s) {
  String o;
  if (!s) return o;
  o.reserve(strlen(s) + 16);
  for (const char* p = s; *p; ++p) {
    switch (*p) {
    case '\\':
      o += "\\\\";
      break;
    case '"':
      o += "\\\"";
      break;
    case '\n':
      o += "\\n";
      break;
    case '\r':
      break;
    default:
      if (static_cast<unsigned char>(*p) < 0x20)
        o += ' ';
      else
        o += *p;
      break;
    }
  }
  return o;
}

void greenaiLog(const char* level, const char* message) {
  if (!message) return;
  if (g_logCount >= LOGQ) {
    for (int i = 1; i < LOGQ; i++) {
      strncpy(g_logLevels[i - 1], g_logLevels[i], sizeof g_logLevels[0]);
      strncpy(g_logMsgs[i - 1], g_logMsgs[i], sizeof g_logMsgs[0]);
      g_logLevels[i - 1][sizeof(g_logLevels[0]) - 1] = '\0';
      g_logMsgs[i - 1][sizeof(g_logMsgs[0]) - 1]    = '\0';
    }
    g_logCount = LOGQ - 1;
  }
  const char* lv = (level && level[0]) ? level : "info";
  strncpy(g_logLevels[g_logCount], lv, sizeof g_logLevels[0] - 1);
  g_logLevels[g_logCount][sizeof(g_logLevels[0]) - 1] = '\0';
  strncpy(g_logMsgs[g_logCount], message, sizeof g_logMsgs[0] - 1);
  g_logMsgs[g_logCount][sizeof(g_logMsgs[0]) - 1] = '\0';
  g_logCount++;
}

void greenaiMarkBootOnce() {
  if (g_bootEnqueued) return;
  g_bootEnqueued = true;
  greenaiLog("info", "device_boot");
}

void greenaiFlushLogs(unsigned long nowMillis) {
  if (!greenaiIsConfigured() || g_logCount == 0) return;
  if (!WiFi.isConnected()) return;

  bool urgent = g_logCount >= LOGQ - 2;
  if (!urgent && (nowMillis - g_lastLogFlushMs) < LOG_FLUSH_MIN_MS) return;
  if (!ensureNetworkTime()) return;

  String hid = hardwareId();
  String body = String("{\"hardwareId\":\"") + jsonEscape(hid.c_str()) + String("\",\"entries\":[");
  for (int i = 0; i < g_logCount; i++) {
    if (i) body += ",";
    body += "{\"level\":\"" + String(g_logLevels[i]) + "\",\"message\":\"";
    body += jsonEscape(g_logMsgs[i]) + "\"}";
  }
  body += "]}";

  int         code = 0;
  String      err;
  g_lastLogFlushMs = nowMillis;
  const bool  sent = postJsonSigned("/internal/sensors/logs", body, code, err);
  if (sent && code >= 200 && code < 300) {
    g_logCount = 0;
    Serial.printf("[greenAI] logs OK http=%d\n", code);
  } else {
    Serial.printf("[greenAI] logs FAIL http=%d err=%s\n", code, err.c_str());
  }
}

void greenaiMaybePostSensor(const SensorData& d, unsigned long nowMillis) {
  if (!greenaiIsConfigured()) return;
  if (!WiFi.isConnected()) return;

  greenaiFlushLogs(nowMillis);

  if (nowMillis - g_lastSensorPostMs < SENSOR_POST_INTERVAL_MS) return;
  if (!ensureNetworkTime()) return;

  const bool hasTemp  = isfinite(d.temperature);
  const bool hasSoil  = d.sensorOK[2];
  const bool hasLux   = isfinite(d.lux) && d.lux >= 0;
  const bool hasPh    = STAGE_PH && d.sensorOK[3] && isfinite(d.pH);
  if (!hasTemp && !hasSoil && !hasLux && !hasPh) {
    Serial.println("[greenAI] skip ingest: no metric");
    g_lastSensorPostMs = nowMillis;
    return;
  }

  time_t measured = time(nullptr);
  String hid  = hardwareId();
  String body = "{\"hardwareId\":\"" + jsonEscape(hid.c_str()) + "\",\"readings\":[{\"measuredAt\":";
  body += String(static_cast<long>(measured));

  if (hasTemp) body += ",\"tempC\":" + String(d.temperature, 2);
  if (hasSoil) body += ",\"soilMoisture\":" + String(d.soilPercent);
  if (hasLux) body += ",\"lux\":" + String(d.lux, 0);
  if (hasPh) body += ",\"phLevel\":" + String(d.pH, 2);
  body += "}]}";

  int    code = 0;
  String err;
  g_lastSensorPostMs = nowMillis;
  if (postJsonSigned("/internal/sensors/ingest", body, code, err) && code >= 200 && code < 300) {
    Serial.printf("[greenAI] ingest OK http=%d\n", code);
  } else {
    char buf[96];
    snprintf(buf, sizeof buf, "sensor_ingest_fail http=%d", code);
    greenaiLog("warn", buf);
    Serial.printf("[greenAI] ingest FAIL http=%d err=%s\n", code, err.c_str());
  }
}

// ============================================================
//  POST /internal/devices/config  — 拉取设备级配置 (wateringMessage)
// ============================================================
void greenaiMaybeFetchConfig(unsigned long nowMillis) {
  if (!greenaiIsConfigured()) return;
  if (!WiFi.isConnected()) return;
  if (g_lastConfigFetchMs != 0 && (nowMillis - g_lastConfigFetchMs) < CONFIG_FETCH_INTERVAL_MS) return;

  const String hid  = hardwareId();
  const String body = String("{\"hardwareId\":\"") + jsonEscape(hid.c_str()) + String("\"}");

  int    code = 0;
  String err;
  String resp;
  g_lastConfigFetchMs = nowMillis;
  if (!postJsonSigned("/internal/devices/config", body, code, err, &resp)) {
    Serial.printf("[greenAI] config FAIL err=%s\n", err.c_str());
    return;
  }
  if (code < 200 || code >= 300) {
    Serial.printf("[greenAI] config http=%d\n", code);
    return;
  }

  // 提取 wateringMessage（字符串）。null 时函数返回 false，表示"无自定义"。
  String wm;
  bool hasCustom = extractJsonStringField(resp, "wateringMessage", wm);

  Preferences p;
  if (!p.begin("plantguard", /*readOnly=*/false)) {
    Serial.println("[greenAI] config: NVS open fail");
    return;
  }
  const String old = prefStringOrEmpty(p, "waterMsg");
  if (hasCustom) {
    if (old != wm) {
      p.putString("waterMsg", wm);
      Serial.printf("[greenAI] waterMsg updated (%u bytes)\n", (unsigned)wm.length());
      ttsInvalidateConfig();
    }
  } else {
    if (old.length() > 0) {
      p.remove("waterMsg");
      Serial.println("[greenAI] waterMsg cleared -> fallback to firmware default");
      ttsInvalidateConfig();
    }
  }
  p.end();
}
