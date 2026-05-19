const { request } = require("../../utils/api.js");
const { refreshTodayTabBadge } = require("../../utils/tabBadge.js");

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

function locationReadable(me) {
  const label = me && me.locationLabel != null ? String(me.locationLabel).trim() : "";
  return label.length > 0 ? label : "";
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
    plants: [],
    // settings
    labels: [...ZONES],
    tzIndex: 0,
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
  },

  onShow() {
    this.load();
    this.loadMeAndWeather();
    refreshTodayTabBadge();
  },

  // ── 植物管理 ──

  async load() {
    try {
      const raw = await request({ path: "/plants", method: "GET" });
      const list = Array.isArray(raw) ? raw : [];
      const plants = list.map((p) => ({
        ...p,
        avatarLetter:
          p.nickname && String(p.nickname).trim()
            ? String(p.nickname).trim().charAt(0)
            : "植",
      }));
      this.setData({ plants });
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  goAdd() {
    wx.navigateTo({ url: "/pages/plant-edit/plant-edit" });
  },

  goEdit(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/plant-edit/plant-edit?id=${id}` });
  },

  goPlan(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/plant-plan/plant-plan?id=${id}` });
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: "确认删除",
      content: "将删除该植物及关联养护任务，不可恢复。",
      success: (res) => {
        if (!res.confirm) return;
        request({ path: `/plants/${id}`, method: "DELETE" })
          .then(() => {
            wx.showToast({ title: "已删除" });
            this.load();
          })
          .catch(() => {
            wx.showToast({ title: "删除失败", icon: "none" });
          });
      },
    });
  },

  // ── 设置：时区 / 环境 / 定位 / 天气 ──

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
      this.setData({
        labels,
        tzIndex: idx,
        locationReadable: locationReadable(me),
        needLocationTip: !hasLoc,
        airConditioning: Boolean(me.airConditioning),
        aspectIndex,

        forecastHint: "",
        forecastDays: [],
        currentLive: null,
        liveWeatherKind: "cloud",
      });
      if (hasLoc) {
        wx.setStorageSync(LOCATION_INTRO_MODAL_KEY, "1");
        try {
          const w = await request({ path: "/weather/current", method: "GET" });
          this.setData({
            currentLive: {
              tempC: Math.round(w.temperatureC),
              rh: Math.round(w.relativeHumidity),
            },
          });
        } catch (e) {
          this.setData({ currentLive: null });
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
          currentLive: null,
        });
      }
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  onTzChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ tzIndex: idx });
    const tz = this.data.labels[idx];
    request({ path: "/users/me", method: "PATCH", data: { timezone: tz } })
      .then(() => wx.showToast({ title: "时区已更新", icon: "none" }))
      .catch(() => {});
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

  onPickLocation() {
    wx.getLocation({
      type: "wgs84",
      success: (res) => {
        const { latitude, longitude } = res;
        // Save location, then auto-detect timezone from coordinates
        request({
          path: "/users/me",
          method: "PATCH",
          data: { latitude, longitude },
        })
          .then(async () => {
            wx.setStorageSync(LOCATION_INTRO_MODAL_KEY, "1");
            try {
              const tzRes = await request({
                path: `/timezone/detect?lat=${latitude}&lng=${longitude}`,
                method: "GET",
              });
              if (tzRes && tzRes.timezone) {
                await request({
                  path: "/users/me",
                  method: "PATCH",
                  data: { timezone: tzRes.timezone },
                });
                wx.showToast({ title: `位置已保存 · 时区 ${tzRes.timezone}` });
              } else {
                wx.showToast({ title: "位置已保存" });
              }
            } catch {
              wx.showToast({ title: "位置已保存" });
            }
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
});
