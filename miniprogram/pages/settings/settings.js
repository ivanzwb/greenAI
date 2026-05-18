const { request } = require("../../utils/api.js");

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

function locSummary(me) {
  if (!me || me.latitude == null || me.longitude == null) return "未设置";
  return `${Number(me.latitude).toFixed(4)}, ${Number(me.longitude).toFixed(4)}`;
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

Page({
  data: {
    labels: [...ZONES],
    tzIndex: 0,
    locSummary: "",
    weatherLine: "",
    forecastHint: "",
    forecastDays: [],
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
      this.setData({
        labels,
        tzIndex: idx,
        locSummary: locSummary(me),
        weatherLine: "",
        forecastHint: "",
        forecastDays: [],
      });
      if (me.latitude != null && me.longitude != null) {
        try {
          const w = await request({ path: "/weather/current", method: "GET" });
          let line = `当前约 ${w.temperatureC}°C，湿度 ${w.relativeHumidity}%`;
          if (w.upcomingWetBias != null && w.upcomingWetBias >= 0.08) {
            line += `；预报偏湿 ${Math.round(w.upcomingWetBias * 100)}%（已微调浇水间隔）`;
          }
          this.setData({
            weatherLine: line,
          });
        } catch (e) {
          this.setData({ weatherLine: "天气暂不可用" });
        }
        try {
          const fc = await request({ path: "/weather/forecast", method: "GET" });
          const raw = (fc && fc.days) || [];
          const forecastDays = raw.map((d) => ({
            date: d.date,
            line: formatForecastDay(d),
          }));
          let forecastHint = "";
          if (raw.some((d) => (d.precipitationProbabilityMax ?? 0) >= 60)) {
            forecastHint = "未来三天内可能有明显降水，浇水可适当保守。";
          } else if (raw.some((d) => (d.precipitationSumMm ?? 0) > 2)) {
            forecastHint = "预报中有较大降水日，注意盆底排水与通风。";
          }
          this.setData({ forecastDays, forecastHint });
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
            wx.showToast({ title: "位置已保存" });
            this.loadMeAndWeather();
          })
          .catch(() => {
            wx.showToast({ title: "保存失败", icon: "none" });
          });
      },
      fail: () => {
        wx.showToast({ title: "需要定位权限", icon: "none" });
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
