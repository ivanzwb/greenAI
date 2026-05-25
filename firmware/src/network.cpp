#include "config.h"
#include "network.h"

#if STAGE_BLE_WIFI

#  include <string>
#  include <BLEDevice.h>
#  include <BLEUtils.h>
#  include <BLEServer.h>
#  include <BLE2902.h>
#  include <Preferences.h>
#  include <WiFi.h>
#  include <HTTPClient.h>

// ============================================================
//  BLE Service UUIDs (custom 128-bit)
// ============================================================
#  define BLE_PROV_SVC_UUID    "0000FFE0-0000-1000-8000-00805F9B34FB"
#  define BLE_CHAR_SSID_UUID   "0000FFE1-0000-1000-8000-00805F9B34FB"
#  define BLE_CHAR_PASS_UUID   "0000FFE2-0000-1000-8000-00805F9B34FB"
#  define BLE_CHAR_URL_UUID    "0000FFE3-0000-1000-8000-00805F9B34FB"
#  define BLE_CHAR_STAT_UUID   "0000FFE4-0000-1000-8000-00805F9B34FB"

#  define NVS_NS         "plantguard"
#  define WIFI_TIMEOUT   30000UL

// ============================================================
//  State & Globals
// ============================================================
enum ProvState {
    PROV_IDLE,
    PROV_WAITING,
    PROV_CONNECTING,
    PROV_CONNECTED,
    PROV_FAILED
};

static ProvState           g_provState = PROV_IDLE;
static BLEServer*          g_bleSrv    = nullptr;
static BLECharacteristic*  g_statChar  = nullptr;
static bool                g_ssidOk    = false;
static bool                g_passOk    = false;
static std::string         g_ssid;
static std::string         g_pass;
static std::string         g_svrUrl   = "http://192.168.1.100:8080/api/sensor";
static unsigned long       g_wifiStartMs = 0;
static Preferences         g_prefs;

// ============================================================
//  Forward declarations
// ============================================================
static void tryProvConnect();

// ============================================================
//  BLE Callbacks
// ============================================================

class ProvSrvCB : public BLEServerCallbacks {
    void onConnect(BLEServer* s) override {
        Serial.println("[BLE] Client connected");
    }
    void onDisconnect(BLEServer* s) override {
        Serial.println("[BLE] Client disconnected");
        if (g_provState != PROV_CONNECTED) s->getAdvertising()->start();
    }
};

class SsidWrCB : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* c) override {
        std::string v = c->getValue();
        if (v.empty()) return;
        g_ssid = v; g_ssidOk = true;
        Serial.printf("[BLE] SSID: %s\n", g_ssid.c_str());
        tryProvConnect();
    }
};

class PassWrCB : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* c) override {
        std::string v = c->getValue();
        if (v.empty()) return;
        g_pass = v; g_passOk = true;
        Serial.println("[BLE] Password received");
        tryProvConnect();
    }
};

class UrlWrCB : public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* c) override {
        std::string v = c->getValue();
        if (v.empty()) return;
        g_svrUrl = v;
        g_prefs.putString("serverUrl", g_svrUrl.c_str());
        Serial.printf("[BLE] Server URL: %s\n", g_svrUrl.c_str());
    }
};

// ============================================================
//  Core Logic
// ============================================================

static void tryProvConnect() {
    if (!g_ssidOk || !g_passOk || g_ssid.empty()) return;
    if (g_provState == PROV_CONNECTING || g_provState == PROV_CONNECTED) return;

    g_provState = PROV_CONNECTING;
    g_wifiStartMs = millis();

    if (g_statChar) {
        g_statChar->setValue("CONNECTING");
        g_statChar->notify();
    }

    // Persist credentials to NVS
    g_prefs.putString("ssid", g_ssid.c_str());
    g_prefs.putString("pass", g_pass.c_str());
    g_prefs.putString("serverUrl", g_svrUrl.c_str());

    WiFi.begin(g_ssid.c_str(), g_pass.c_str());
}

static void startBLEProv() {
    BLEDevice::init("PlantGuardian");
    g_bleSrv = BLEDevice::createServer();
    g_bleSrv->setCallbacks(new ProvSrvCB());

    BLEService* svc = g_bleSrv->createService(BLE_PROV_SVC_UUID);

    auto* cSsid = svc->createCharacteristic(
        BLE_CHAR_SSID_UUID, BLECharacteristic::PROPERTY_WRITE);
    cSsid->setCallbacks(new SsidWrCB());

    auto* cPass = svc->createCharacteristic(
        BLE_CHAR_PASS_UUID, BLECharacteristic::PROPERTY_WRITE);
    cPass->setCallbacks(new PassWrCB());

    auto* cUrl = svc->createCharacteristic(
        BLE_CHAR_URL_UUID, BLECharacteristic::PROPERTY_WRITE);
    cUrl->setCallbacks(new UrlWrCB());

    g_statChar = svc->createCharacteristic(
        BLE_CHAR_STAT_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
    g_statChar->addDescriptor(new BLE2902());
    g_statChar->setValue("WAITING");

    svc->start();

    BLEAdvertising* adv = g_bleSrv->getAdvertising();
    adv->addServiceUUID(BLE_PROV_SVC_UUID);
    adv->setScanResponse(true);
    adv->start();

    g_provState = PROV_WAITING;
    Serial.println("[BLE] Provisioning active — send SSID/Password via BLE");
}

static bool loadSavedCreds() {
    // Try-get pattern avoids depending on isKey() (older ESP32 core compat)
    g_ssid   = g_prefs.getString("ssid", "").c_str();
    if (g_ssid.empty()) return false;
    g_pass   = g_prefs.getString("pass", "").c_str();
    g_svrUrl = g_prefs.getString("serverUrl", g_svrUrl.c_str()).c_str();
    return true;
}

// ============================================================
//  Public API
// ============================================================

void wifiProvSetup() {
    g_prefs.begin(NVS_NS, false);
    Serial.printf("[WiFi] MAC: %s\n", WiFi.macAddress().c_str());

    if (loadSavedCreds()) {
        Serial.printf("[WiFi] Saved SSID '%s' — connecting...\n", g_ssid.c_str());
        g_provState = PROV_CONNECTING;
        g_wifiStartMs = millis();
        WiFi.begin(g_ssid.c_str(), g_pass.c_str());
    } else {
        startBLEProv();
    }
}

void wifiProvLoop() {
    switch (g_provState) {

    case PROV_CONNECTING: {
        if (WiFi.status() == WL_CONNECTED) {
            g_provState = PROV_CONNECTED;
            Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
            if (g_statChar) {
                g_statChar->setValue(std::string("OK:") + WiFi.localIP().toString().c_str());
                g_statChar->notify();
            }
            if (g_bleSrv) g_bleSrv->getAdvertising()->stop();
        } else if (millis() - g_wifiStartMs > WIFI_TIMEOUT) {
            Serial.println("[WiFi] Connection timeout");
            g_provState = PROV_FAILED;
            g_ssidOk = false; g_passOk = false;
            if (g_statChar) {
                g_statChar->setValue("FAIL:TIMEOUT");
                g_statChar->notify();
            }
        }
        break;
    }

    case PROV_FAILED: {
        static unsigned long lastRetry = 0;
        if (millis() - lastRetry > 15000) {
            lastRetry = millis();
            Serial.println("[WiFi] Retrying saved credentials...");
            g_provState = PROV_CONNECTING;
            g_wifiStartMs = millis();
            WiFi.begin(g_ssid.c_str(), g_pass.c_str());
        }
        break;
    }

    case PROV_CONNECTED:
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WiFi] Connection lost — reconnecting...");
            g_provState = PROV_CONNECTING;
            g_wifiStartMs = millis();
            WiFi.reconnect();
        }
        break;

    default: break;
    }
}

// ============================================================
//  HTTP Upload
// ============================================================

#  if STAGE_WIFI_UPLOAD

static unsigned long g_lastUpload = 0;
static const unsigned long UPLOAD_INT = 15000UL;  // 15 s

void uploadSensorData(const SensorData& d) {
    if (g_provState != PROV_CONNECTED || WiFi.status() != WL_CONNECTED) return;
    if (g_svrUrl.empty()) return;

    unsigned long now = millis();
    if (now - g_lastUpload < UPLOAD_INT) return;
    g_lastUpload = now;

    HTTPClient http;
    http.begin(g_svrUrl.c_str());
    http.addHeader("Content-Type", "application/json");

    String json  = "{";
    json += "\"temperature\":"   + String(d.temperature, 1) + ",";
    json += "\"humidity\":"      + String(d.humidity, 0)    + ",";
    json += "\"lux\":"           + String(d.lux, 0)         + ",";
    json += "\"soilPercent\":"   + String(d.soilPercent)    + ",";
    json += "\"soilRaw\":"       + String(d.soilRaw);
    if (d.sensorOK[3] && !isnan(d.pH)) {
        json += ",\"pH\":" + String(d.pH, 1);
    }
    json += ",\"mac\":\"" + WiFi.macAddress() + "\"";
    json += "}";

    int code = http.POST(json);
    if (code > 0) {
        Serial.printf("[UPLOAD] HTTP %d\n", code);
    } else {
        Serial.printf("[UPLOAD] Error: %s\n", http.errorToString(code).c_str());
    }
    http.end();
}

#  else   // STAGE_BLE_WIFI==1 but STAGE_WIFI_UPLOAD==0
void uploadSensorData(const SensorData&) {}
#  endif  // STAGE_WIFI_UPLOAD

#else  // STAGE_BLE_WIFI == 0 — empty stubs

void wifiProvSetup() {}
void wifiProvLoop() {}
void uploadSensorData(const SensorData&) {}

#endif     // STAGE_BLE_WIFI
