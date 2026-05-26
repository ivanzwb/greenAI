#include "config.h"
#include "network.h"

#if STAGE_WIFI_PROV

#  include <WiFi.h>
#  include <WebServer.h>
#  include <DNSServer.h>
#  include <Preferences.h>
#  include <HTTPClient.h>

// ============================================================
//  Constants
// ============================================================
#  define AP_SSID       "植物管家-配网"
#  define AP_PASS       ""               // open AP
#  define NVS_NS        "plantguard"
#  define WIFI_TIMEOUT  20000UL
#  define DNS_PORT      53
#  define HTTP_PORT     80

// ============================================================
//  State
// ============================================================
enum ProvState {
    PROV_BOOT,
    PROV_STA_CONNECTING,
    PROV_AP_ACTIVE,
    PROV_CONNECTED,
};

static ProvState     g_state       = PROV_BOOT;
static unsigned long g_wifiStartMs = 0;
static bool          g_apActive    = false;
static String        g_lastError;
static String        g_svrUrl      = "http://192.168.1.100:8080/api/sensor";
static String        g_ssid;
static String        g_pass;

static WebServer     g_http(HTTP_PORT);
static DNSServer     g_dns;
static Preferences   g_prefs;

// ============================================================
//  Forward decls
// ============================================================
static void startSoftAP();
static void stopSoftAP();
static bool connectSTA(const String& ssid, const String& pass);

// ============================================================
//  HTML — single embedded page
// ============================================================
static const char PAGE_HTML[] PROGMEM = R"HTML(
<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>植物管家 WiFi 配网</title>
<style>
 body{font-family:-apple-system,system-ui,sans-serif;margin:0;padding:20px;background:#f5f5f7;color:#222}
 h2{margin-top:0;color:#2d8a3e;display:flex;align-items:center;gap:8px}
 .card{background:#fff;border-radius:12px;padding:18px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
 input,select,button{font-size:16px;width:100%;padding:11px;margin:6px 0;border:1px solid #d2d2d7;border-radius:8px;box-sizing:border-box}
 button{background:#2d8a3e;color:#fff;border:0;font-weight:600;margin-top:10px;display:flex;align-items:center;justify-content:center;gap:6px}
 button:active{background:#1f6b2c}
 .status{font-size:14px;padding:8px;border-radius:6px;margin-top:8px;display:flex;align-items:center;gap:6px}
 .ok{background:#d4f4dd;color:#1b5e20}
 .err{background:#fdd;color:#b71c1c}
 .info{background:#e3f2fd;color:#0d47a1}
 label{font-size:13px;color:#555;display:flex;align-items:center;gap:6px;margin-top:6px}
 .net-list{max-height:220px;overflow-y:auto}
 .net{padding:10px;border-bottom:1px solid #eee;cursor:pointer;display:flex;align-items:center;gap:10px}
 .net:hover{background:#f0f0f0}
 .net .name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .net small{color:#888}
 .ico{flex:none;display:inline-block;vertical-align:middle}
 .bars{display:inline-flex;align-items:flex-end;gap:2px;height:14px}
 .bars i{width:3px;background:#bbb;border-radius:1px}
 .bars i.on{background:#2d8a3e}
 .bars i:nth-child(1){height:25%}
 .bars i:nth-child(2){height:50%}
 .bars i:nth-child(3){height:75%}
 .bars i:nth-child(4){height:100%}
</style></head>
<body>
<h2>
 <svg class="ico" width="40" height="40" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
   <radialGradient id="bgG" cx="0.5" cy="0.5" r="0.8">
    <stop offset="0%" stop-color="#F0FFF8"/><stop offset="100%" stop-color="#E0F0E8"/>
   </radialGradient>
   <radialGradient id="lfG" cx="0.3" cy="0.3" r="0.8">
    <stop offset="0%" stop-color="#66BB88"/><stop offset="100%" stop-color="#4A9C6E"/>
   </radialGradient>
   <linearGradient id="ptG" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#8FA598"/><stop offset="100%" stop-color="#708578"/>
   </linearGradient>
   <linearGradient id="ldG" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#A8BBAE"/><stop offset="100%" stop-color="#8FA598"/>
   </linearGradient>
  </defs>
  <rect x="0" y="0" width="200" height="200" rx="40" ry="40" fill="url(#bgG)"/>
  <path d="M60,130 Q55,160 65,165 Q100,180 135,165 Q145,160 140,130 Z" fill="url(#ptG)"/>
  <rect x="55" y="115" width="90" height="20" rx="5" ry="5" fill="url(#ldG)"/>
  <circle cx="100" cy="135" r="5" fill="#FFFFFF" fill-opacity="0.9"/>
  <rect x="96" y="95" width="8" height="25" fill="#4A9C6E"/>
  <circle cx="75" cy="75" r="30" fill="url(#lfG)"/>
  <circle cx="125" cy="75" r="30" fill="url(#lfG)"/>
  <circle cx="65" cy="65" r="8" fill="#FFFFFF" fill-opacity="0.2"/>
  <circle cx="115" cy="65" r="8" fill="#FFFFFF" fill-opacity="0.2"/>
 </svg>
 植物管家 配网
</h2>

<div class="card">
  <label>
   <svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="#555"><path d="M12 21l3.6-4.5c-1-.8-2.3-1.3-3.6-1.3s-2.5.5-3.6 1.3L12 21zM8 14c1.1-1 2.5-1.5 4-1.5s2.9.5 4 1.5l2-2.5C16.4 10 14.3 9 12 9s-4.4 1-6 2.5L8 14zM4 10c2.1-1.9 4.9-3 8-3s5.9 1.1 8 3l2-2.5C19.2 5 15.7 3.5 12 3.5S4.8 5 1.5 7.5L4 10z"/></svg>
   附近 WiFi（点击选择）
  </label>
  <div id="netlist" class="net-list info status">点 "重新扫描" 加载…</div>
  <button onclick="scan()">
   <svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M17.65 6.35A8 8 0 1 0 19.73 13h-2.08A6 6 0 1 1 12 6a5.9 5.9 0 0 1 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
   重新扫描
  </button>
</div>

<div class="card">
  <form id="f" onsubmit="submit_();return false">
    <label>
     <svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="#555"><path d="M12 21l3.6-4.5c-1-.8-2.3-1.3-3.6-1.3s-2.5.5-3.6 1.3L12 21zM8 14c1.1-1 2.5-1.5 4-1.5s2.9.5 4 1.5l2-2.5C16.4 10 14.3 9 12 9s-4.4 1-6 2.5L8 14zM4 10c2.1-1.9 4.9-3 8-3s5.9 1.1 8 3l2-2.5C19.2 5 15.7 3.5 12 3.5S4.8 5 1.5 7.5L4 10z"/></svg>
     WiFi 名称 (SSID)
    </label>
    <input id="ssid" required>
    <label>
     <svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="#555"><path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM9 8V6a3 3 0 0 1 6 0v2H9z"/></svg>
     WiFi 密码
    </label>
    <input id="pass" type="password">
    <label>
     <svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="#555"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1 17.9A8 8 0 0 1 4.1 13H8c.1 2 .5 3.9 1.1 5.5-.6.5-1.1 1-1.1 1.4zM8 11c.1-1.7.5-3.3 1-4.6.5-.4 1-.9 1.6-1.4-.5 1.7-.6 4-.6 6zm5 8.9c-.4 0-.9-.5-1.5-1.1.7-1.4 1.1-3 1.2-4.8h3.9a8 8 0 0 1-3.6 5.9z"/></svg>
     后端 URL (可选)
    </label>
    <input id="url" placeholder="http://192.168.1.100:8080/api/sensor">
    <button type="submit">
     <svg class="ico" width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>
     保存并连接
    </button>
  </form>
  <div id="result" class="status"></div>
</div>

<script>
function el(id){return document.getElementById(id)}
function bars(rssi){
 // RSSI -50:4格, -65:3, -75:2, else:1
 let n=1;
 if(rssi>=-50)n=4;else if(rssi>=-65)n=3;else if(rssi>=-75)n=2;
 let h='<span class="bars">';
 for(let i=1;i<=4;i++)h+=`<i class="${i<=n?'on':''}"></i>`;
 return h+'</span>';
}
function lockIco(){
 return '<svg class="ico" width="12" height="12" viewBox="0 0 24 24" fill="#888"><path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-9 0V6a3 3 0 0 1 6 0v2H9z"/></svg>';
}
function scan(){
 el('netlist').className='net-list info status';
 el('netlist').textContent='扫描中…(约5秒)';
 fetch('/scan').then(r=>r.json()).then(d=>{
  if(!d.nets||!d.nets.length){el('netlist').textContent='未发现任何 WiFi';return}
  el('netlist').className='net-list';
  el('netlist').innerHTML=d.nets.map(n=>
   `<div class="net" onclick="pick('${n.s.replace(/'/g,"\\'")}')">
     ${bars(n.r)}
     <span class="name">${n.s}</span>
     <small>${n.r}dBm ${n.e?lockIco():''}</small>
    </div>`
  ).join('')
 }).catch(e=>{el('netlist').textContent='扫描失败:'+e})
}
function pick(s){el('ssid').value=s;el('pass').focus()}
function submit_(){
 const r=el('result');r.className='status info';r.textContent='⏳ 提交中…';
 const body=new URLSearchParams({s:el('ssid').value,p:el('pass').value,u:el('url').value});
 fetch('/save',{method:'POST',body}).then(r=>r.json()).then(d=>{
  if(d.ok){r.className='status ok';r.textContent='✓ 已保存，正在连接 WiFi…';
    setTimeout(poll,3000)}
  else{r.className='status err';r.textContent='✗ '+(d.err||'失败')}
 }).catch(e=>{r.className='status err';r.textContent='请求失败:'+e})
}
function poll(){
 fetch('/status').then(r=>r.json()).then(d=>{
  const r=el('result');
  if(d.ok){r.className='status ok';r.textContent='✓ 已连接！IP: '+d.ip+'  此页面可以关闭。'}
  else{r.className='status info';r.textContent='⏳ 连接中… '+(d.err||'');setTimeout(poll,2000)}
 }).catch(_=>setTimeout(poll,2000))
}
scan();
</script>
</body></html>
)HTML";

// ============================================================
//  HTTP handlers
// ============================================================
static void hRoot() {
    g_http.send_P(200, "text/html; charset=utf-8", PAGE_HTML);
}

static void hScan() {
    int n = WiFi.scanNetworks(false, true);
    // 去重：同名 SSID 只保留信号最强的一条
    struct Net { String ssid; int rssi; bool enc; };
    Net nets[24];
    int count = 0;
    for (int i = 0; i < n && count < 24; i++) {
        String ssid = WiFi.SSID(i);
        if (ssid.length() == 0) continue;            // 跳过隐藏 SSID
        int rssi = WiFi.RSSI(i);
        bool enc = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
        int idx = -1;
        for (int k = 0; k < count; k++) if (nets[k].ssid == ssid) { idx = k; break; }
        if (idx >= 0) {
            if (rssi > nets[idx].rssi) { nets[idx].rssi = rssi; nets[idx].enc = enc; }
        } else {
            nets[count++] = { ssid, rssi, enc };
        }
    }
    // 按信号强度从大到小排序
    for (int i = 0; i < count - 1; i++)
        for (int j = i + 1; j < count; j++)
            if (nets[j].rssi > nets[i].rssi) { Net t = nets[i]; nets[i] = nets[j]; nets[j] = t; }

    String j = "{\"nets\":[";
    for (int i = 0; i < count; i++) {
        if (i) j += ",";
        String s = nets[i].ssid;
        s.replace("\\", "\\\\");
        s.replace("\"", "\\\"");
        j += "{\"s\":\"" + s + "\",";
        j += "\"r\":" + String(nets[i].rssi) + ",";
        j += "\"e\":" + String(nets[i].enc ? 1 : 0) + "}";
    }
    j += "]}";
    WiFi.scanDelete();
    g_http.send(200, "application/json", j);
}

static void hSave() {
    String ssid = g_http.arg("s");
    String pass = g_http.arg("p");
    String url  = g_http.arg("u");
    if (ssid.length() == 0) {
        g_http.send(200, "application/json", "{\"ok\":false,\"err\":\"SSID empty\"}");
        return;
    }
    g_ssid = ssid; g_pass = pass;
    if (url.length()) g_svrUrl = url;

    g_prefs.putString("ssid", g_ssid);
    g_prefs.putString("pass", g_pass);
    g_prefs.putString("serverUrl", g_svrUrl);

    g_http.send(200, "application/json", "{\"ok\":true}");

    Serial.printf("[PROV] Got SSID='%s' (pass len=%d), attempting connect...\n",
                  g_ssid.c_str(), g_pass.length());
    g_state = PROV_STA_CONNECTING;
    g_wifiStartMs = millis();
    WiFi.begin(g_ssid.c_str(), g_pass.c_str());
}

static void hStatus() {
    if (g_state == PROV_CONNECTED && WiFi.status() == WL_CONNECTED) {
        String j = "{\"ok\":true,\"ip\":\"" + WiFi.localIP().toString() + "\"}";
        g_http.send(200, "application/json", j);
    } else {
        String j = "{\"ok\":false,\"err\":\"" + g_lastError + "\"}";
        g_http.send(200, "application/json", j);
    }
}

// Captive portal: catch-all redirect to root
static void hCaptive() {
    g_http.sendHeader("Location", "http://192.168.4.1/", true);
    g_http.send(302, "text/plain", "");
}

// ============================================================
//  SoftAP + captive portal
// ============================================================
static void startSoftAP() {
    if (g_apActive) return;
    WiFi.mode(WIFI_AP_STA);   // STA still needed to attempt connect later
    WiFi.softAP(AP_SSID, AP_PASS);
    IPAddress ip = WiFi.softAPIP();
    Serial.printf("[AP] '%s' started, IP: %s\n", AP_SSID, ip.toString().c_str());

    g_dns.setErrorReplyCode(DNSReplyCode::NoError);
    g_dns.start(DNS_PORT, "*", ip);   // catch all DNS

    g_http.on("/", hRoot);
    g_http.on("/scan", hScan);
    g_http.on("/save", HTTP_POST, hSave);
    g_http.on("/status", hStatus);
    // Common captive-portal probe URLs
    g_http.on("/generate_204", hCaptive);            // Android
    g_http.on("/gen_204",      hCaptive);            // Android
    g_http.on("/hotspot-detect.html", hCaptive);     // iOS / macOS
    g_http.on("/connecttest.txt", hCaptive);         // Windows
    g_http.on("/ncsi.txt",     hCaptive);            // Windows
    g_http.onNotFound(hCaptive);

    g_http.begin();
    g_apActive = true;
    g_state    = PROV_AP_ACTIVE;
    Serial.println("[AP] HTTP+DNS up. Connect phone to '" AP_SSID "' then open http://192.168.4.1/");
}

static void stopSoftAP() {
    if (!g_apActive) return;
    g_dns.stop();
    g_http.stop();
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    g_apActive = false;
    Serial.println("[AP] stopped");
}

// ============================================================
//  STA logic
// ============================================================
static bool loadSavedCreds() {
    g_ssid   = g_prefs.getString("ssid", "");
    if (g_ssid.length() == 0) return false;
    g_pass   = g_prefs.getString("pass", "");
    g_svrUrl = g_prefs.getString("serverUrl", g_svrUrl);
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
        WiFi.mode(WIFI_STA);
        WiFi.begin(g_ssid.c_str(), g_pass.c_str());
        g_state = PROV_STA_CONNECTING;
        g_wifiStartMs = millis();
    } else {
        Serial.println("[WiFi] No saved creds — starting SoftAP for provisioning");
        startSoftAP();
    }
}

void wifiProvLoop() {
    if (g_apActive) {
        g_dns.processNextRequest();
        g_http.handleClient();
    }

    switch (g_state) {

    case PROV_STA_CONNECTING: {
        if (WiFi.status() == WL_CONNECTED) {
            g_state = PROV_CONNECTED;
            Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
            // 给前端一次拉取 /status 成功的机会，再关 AP
            delay(2000);
            stopSoftAP();
        } else if (millis() - g_wifiStartMs > WIFI_TIMEOUT) {
            g_lastError = "TIMEOUT/认证失败";
            Serial.printf("[WiFi] Connect FAILED (status=%d)\n", WiFi.status());
            WiFi.disconnect(false, false);
            if (!g_apActive) startSoftAP();  // 重新拉起 AP 让用户重试
            else g_state = PROV_AP_ACTIVE;
        }
        break;
    }

    case PROV_CONNECTED: {
        if (WiFi.status() != WL_CONNECTED) {
            Serial.println("[WiFi] Lost — reconnecting...");
            g_state = PROV_STA_CONNECTING;
            g_wifiStartMs = millis();
            WiFi.reconnect();
        }
        break;
    }

    default: break;
    }
}

bool wifiIsConnected() {
    return g_state == PROV_CONNECTED && WiFi.status() == WL_CONNECTED;
}

void wifiClearCreds() {
    g_prefs.remove("ssid");
    g_prefs.remove("pass");
    g_prefs.remove("serverUrl");
    Serial.println("[NVS] WiFi credentials cleared");
}

// ============================================================
//  HTTP Upload
// ============================================================
#  if STAGE_WIFI_UPLOAD

static unsigned long g_lastUpload = 0;
static const unsigned long UPLOAD_INT = 15000UL;

void uploadSensorData(const SensorData& d) {
    if (!wifiIsConnected()) return;
    if (g_svrUrl.length() == 0) return;
    unsigned long now = millis();
    if (now - g_lastUpload < UPLOAD_INT) return;
    g_lastUpload = now;

    HTTPClient http;
    http.begin(g_svrUrl);
    http.addHeader("Content-Type", "application/json");
    String json  = "{";
    json += "\"temperature\":"   + String(d.temperature, 1) + ",";
    json += "\"humidity\":"      + String(d.humidity, 0)    + ",";
    json += "\"lux\":"           + String(d.lux, 0)         + ",";
    json += "\"soilPercent\":"   + String(d.soilPercent)    + ",";
    json += "\"soilRaw\":"       + String(d.soilRaw);
    if (d.sensorOK[3] && !isnan(d.pH)) json += ",\"pH\":" + String(d.pH, 1);
    json += ",\"mac\":\"" + WiFi.macAddress() + "\"";
    json += "}";
    int code = http.POST(json);
    if (code > 0) Serial.printf("[UPLOAD] HTTP %d\n", code);
    else          Serial.printf("[UPLOAD] Error: %s\n", http.errorToString(code).c_str());
    http.end();
}

#  else
void uploadSensorData(const SensorData&) {}
#  endif

#else  // STAGE_WIFI_PROV == 0
void wifiProvSetup() {}
void wifiProvLoop() {}
void uploadSensorData(const SensorData&) {}
bool wifiIsConnected() { return false; }
void wifiClearCreds() {}
#endif
