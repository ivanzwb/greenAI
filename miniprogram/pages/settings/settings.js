const { request, getUserId, setUserId } = require("../../utils/api.js");

/** 与首页 index.js 一致：已有位置后不再弹出「去设位置」引导。 */
const LOCATION_INTRO_MODAL_KEY = "greenai_location_intro_modal_done";

const ZONES = [
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Singapore",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
];

const WINDOW_ASPECT_KEYS = ["unknown", "north", "south", "east", "west"];
const WINDOW_ASPECT_LABELS = ["未知", "北向", "南向", "东向", "西向"];

function locSummary(me) {
  if (!me || me.latitude == null || me.longitude == null) return "未设置";
  return `${Number(me.latitude).toFixed(4)}, ${Number(me.longitude).toFixed(4)}`;
}

function locationReadable(me) {
  const label = me && me.locationLabel != null ? String(me.locationLabel).trim() : "";
  return label.length > 0 ? label : "";
}

function userIdPreview(id) {
  if (!id || typeof id !== "string") return "—";
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function formatBindExpire(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function formatForecastDay(d) {
  const lo = Math.round(d.tempMinC);
  const hi = Math.round(d.tempMaxC);
  const parts = [`${d.date}`, `${lo}–${hi}°C`];
  if (d.precipitationProbabilityMax != null) {
    parts.push(`降雨概率${d.precipitationProbabilityMax}%`);
  }
  if (d.precipitationSumMm != null && d.precipitationSumMm > 0.05) {
    parts.push(`降水约${d.precipitationSumMm}mm`);
  }
  return parts.join(" · ");
}

/** Open-Meteo WMO weathercode → 简图标类名 */
function wmoWeatherKind(code) {
  if (code == null || typeof code !== "number") return "cloud";
  if (code === 0 || code === 1) return "sun";
  if (code === 2 || code === 3) return "cloud";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 86) return "snow";
  if (code >= 95) return "storm";
  if (code >= 45 && code <= 48) return "fog";
  return "cloud";
}

function enrichForecastDays(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const temps = raw.flatMap((d) => [d.tempMinC, d.tempMaxC]);
  const gMin = Math.min(...temps);
  const gMax = Math.max(...temps);
  const span = Math.max(gMax - gMin, 1);
  return raw.map((d) => {
    const dateShort =
      typeof d.date === "string" && d.date.length >= 10
        ? `${d.date.slice(5, 7)}/${d.date.slice(8, 10)}`
        : String(d.date || "");
    return {
      date: d.date,
      dateShort,
      line: formatForecastDay(d),
      hi: Math.round(d.tempMaxC),
      lo: Math.round(d.tempMinC),
      weatherKind: wmoWeatherKind(d.weatherCode),
      barFillRpx: Math.round(36 + ((d.tempMaxC - gMin) / span) * 104),
    };
  });
}

Page({
  data: {
    labels: [...ZONES],
    tzIndex: 0,
    locSummary: "",
    locationReadable: "",
    needLocationTip: false,
    weatherLine: "",
    forecastHint: "",
    forecastDays: [],
    currentLive: null,
    liveWeatherKind: "cloud",
    aspectKeys: WINDOW_ASPECT_KEYS,
    aspectLabels: WINDOW_ASPECT_LABELS,
    aspectIndex: 0,
    airConditioning: false,
    userIdPreview: "—",
    bindCode: "",
    bindExpires: "",
    bindExpiresText: "",
    bindLoading: false,
  },
  async onShow() {
    await this.loadMeAndWeather();
  },
  async loadMeAndWeather() {
    try {
      const me = await request({ path: "/users/me", method: "GET" });
      const tz = me.timezone || "Asia/Shanghai";
      let labels = [...ZONES];
      let idx = labels.indexOf(tz);
      if (idx < 0) {
        labels = [tz, ...labels];
        idx = 0;
      }
      const hasLoc = me.latitude != null && me.longitude != null;
      let aspectIndex = 0;
      const wa = me.windowAspect || "unknown";
      const ai = WINDOW_ASPECT_KEYS.indexOf(wa);
      if (ai >= 0) aspectIndex = ai;
      if (me.id) setUserId(me.id);
      this.setData({
        labels,
        tzIndex: idx,
        locSummary: locSummary(me),
        locationReadable: locationReadable(me),
        needLocationTip: !hasLoc,
        airConditioning: Boolean(me.airConditioning),
        aspectIndex,
        userIdPreview: userIdPreview(me.id),
        weatherLine: "",
        forecastHint: "",
        forecastDays: [],
        currentLive: null,
        liveWeatherKind: "cloud",
      });
      if (hasLoc) {
        wx.setStorageSync(LOCATION_INTRO_MODAL_KEY, "1");
        try {
          const w = await request({ path: "/weather/current", method: "GET" });
          let line = `当前约 ${w.temperatureC}°C，湿度 ${w.relativeHumidity}%`;
          if (w.upcomingWetBias != null && w.upcomingWetBias >= 0.08) {
            line += `；预报偏湿 ${Math.round(w.upcomingWetBias * 100)}%（已微调浇水间隔）`;
          }
          if (w.upcomingDryBias != null && w.upcomingDryBias >= 0.45) {
            line += `；预报偏旱 ${Math.round(w.upcomingDryBias * 100)}%（已微调浇水间隔）`;
          }
          this.setData({
            weatherLine: line,
            currentLive: {
              tempC: Math.round(w.temperatureC),
              rh: Math.round(w.relativeHumidity),
            },
          });
        } catch (e) {
          this.setData({ weatherLine: "天气暂不可用", currentLive: null });
        }
        try {
          const fc = await request({ path: "/weather/forecast", method: "GET" });
          const raw = (fc && fc.days) || [];
          const forecastDays = enrichForecastDays(raw);
          let forecastHint = "";
          if (raw.some((d) => (d.precipitationProbabilityMax ?? 0) >= 60)) {
            forecastHint = "未来三天内可能有明显降水，浇水可适当保守。";
          } else if (raw.some((d) => (d.precipitationSumMm ?? 0) > 2)) {
            forecastHint = "预报中有较大降水日，注意盆底排水与通风。";
          }
          const liveWeatherKind =
            raw.length > 0 ? wmoWeatherKind(raw[0].weatherCode) : this.data.liveWeatherKind;
          this.setData({ forecastDays, forecastHint, liveWeatherKind });
        } catch (e) {
          this.setData({ forecastDays: [], forecastHint: "" });
        }
      } else {
        this.setData({
          weatherLine: "设置位置后可查看当前天气与预报（Open-Meteo）",
        });
      }
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },
  onTzChange(e) {
    this.setData({ tzIndex: Number(e.detail.value) });
  },
  onAspectChange(e) {
    this.setData({ aspectIndex: Number(e.detail.value) });
  },
  onAcChange(e) {
    this.setData({ airConditioning: e.detail.value });
  },
  async onSaveEnv() {
    const aspect = this.data.aspectKeys[this.data.aspectIndex];
    try {
      await request({
        path: "/users/me",
        method: "PATCH",
        data: {
          airConditioning: this.data.airConditioning,
          windowAspect: aspect,
        },
      });
      wx.showToast({ title: "环境偏好已保存" });
      this.loadMeAndWeather();
    } catch (e) {
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  },
  async onSave() {
    const tz = this.data.labels[this.data.tzIndex];
    try {
      await request({
        path: "/users/me",
        method: "PATCH",
        data: { timezone: tz },
      });
      wx.showToast({ title: "已保存" });
      this.loadMeAndWeather();
    } catch (e) {
      wx.showToast({ title: "保存失败", icon: "none" });
    }
  },
  onPickLocation() {
    wx.getLocation({
      type: "wgs84",
      success: (res) => {
        request({
          path: "/users/me",
          method: "PATCH",
          data: { latitude: res.latitude, longitude: res.longitude },
        })
          .then(() => {
            wx.setStorageSync(LOCATION_INTRO_MODAL_KEY, "1");
            wx.showToast({ title: "位置已保存" });
            this.loadMeAndWeather();
          })
          .catch(() => {
            wx.showToast({ title: "保存失败", icon: "none" });
          });
      },
      fail: (err) => {
        const msg = (err && err.errMsg) || "";
        const denied =
          msg.includes("auth deny") ||
          msg.includes("permission") ||
          msg.includes("privacy");
        if (denied) {
          wx.showModal({
            title: "需要定位权限",
            content:
              "保存经纬度后，才能根据所在地天气（Open-Meteo）微调浇水间隔。请在系统或小程序设置中开启位置权限。",
            confirmText: "去设置",
            cancelText: "取消",
            success: (m) => {
              if (m.confirm) wx.openSetting({});
            },
          });
        } else {
          wx.showToast({ title: "定位失败，请重试", icon: "none" });
        }
      },
    });
  },
  onClearLocation() {
    wx.showModal({
      title: "清除位置",
      content: "将删除已保存的经纬度，天气将不再展示。",
      success: (r) => {
        if (!r.confirm) return;
        request({
          path: "/users/me",
          method: "PATCH",
          data: { clearLocation: true },
        })
          .then(() => {
            wx.showToast({ title: "已清除" });
            this.loadMeAndWeather();
          })
          .catch(() => {
            wx.showToast({ title: "操作失败", icon: "none" });
          });
      },
    });
  },
  /**
   * 跳转传感器配网向导页。BLE 仅在该向导内为「一次性下发 Wi-Fi 凭据」短暂使用，
   * 之后所有读数走「设备 → 云端」HTTPS 直连，与小程序无关。
   */
  onOpenProvision() {
    wx.navigateTo({ url: "/pages/device-provision/device-provision" });
  },
  async onCreateBindCode() {
    this.setData({ bindLoading: true });
    try {
      const r = await request({ path: "/devices/binding-codes", method: "POST" });
      this.setData({
        bindCode: r.code || "",
        bindExpires: r.expiresAt || "",
        bindExpiresText: formatBindExpire(r.expiresAt),
        bindLoading: false,
      });
      wx.showToast({ title: "已生成", icon: "success" });
    } catch (e) {
      this.setData({ bindLoading: false });
      wx.showToast({ title: "生成失败，请登录后重试", icon: "none" });
    }
  },
  onCopyBindCode() {
    const c = this.data.bindCode;
    if (!c) {
      wx.showToast({ title: "请先生成绑定码", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: c });
  },
  onCopyUserId() {
    const u = getUserId();
    if (!u) {
      wx.showToast({ title: "无用户 ID", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: u });
  },
});
