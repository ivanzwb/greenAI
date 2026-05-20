const {
  request,
  SUBSCRIBE_TEMPLATE_ID,
  reportSubscribeFromWxResult,
} = require("../../utils/api.js");
const { setTodayTabBadgeFromCount } = require("../../utils/tabBadge.js");

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * WMO weather code → emoji icon
 * https://open-meteo.com/en/docs#weathervariables
 */
function wmoIcon(code) {
  if (code == null) return "🌤";
  if (code === 0) return "☀️";
  if (code <= 3) return "🌤";
  if (code <= 48) return "🌫";
  if (code <= 57) return "🌦";
  if (code <= 65) return "🌧";
  if (code <= 77) return "🌨";
  if (code <= 82) return "🌦";
  if (code >= 95) return "⛈";
  return "🌤";
}

Page({
  data: {
    // hero
    heroDate: "",
    weekday: "",
    greeting: "",
    summaryText: "加载中…",

    // stats
    plantCount: 0,
    pendingCount: 0,
    attentionCount: 0,

    // weather
    weatherCurrent: null,
    forecastDays: [],

    // tasks
    tasks: [],
  },

  async onShow() {
    const now = new Date();
    const h = now.getHours();
    let greeting;
    if (h < 5) greeting = "夜深了";
    else if (h < 12) greeting = "早上好";
    else if (h < 18) greeting = "下午好";
    else greeting = "晚上好";

    this.setData({
      heroDate: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
      weekday: WEEKDAYS[now.getDay()],
      greeting,
    });

    await this.loadDashboard();
  },

  async loadDashboard() {
    // Fire all data fetches in parallel, tolerate partial failures
    const [tasksRes, plantsRes, weatherRes, forecastRes] = await Promise.allSettled([
      this.loadTasks(),
      this.loadPlants(),
      this.loadWeather(),
      this.loadForecast(),
    ]);

    const tasks = tasksRes.status === "fulfilled" ? tasksRes.value : [];
    const plants = plantsRes.status === "fulfilled" ? plantsRes.value : [];
    const weatherCurrent = weatherRes.status === "fulfilled" ? weatherRes.value : null;
    const forecastDays = forecastRes.status === "fulfilled" ? forecastRes.value : [];

    const pendingCount = tasks.length;
    const plantCount = Array.isArray(plants) ? plants.length : 0;

    // "attention" = plants with overdue tasks (rough heuristic)
    const attentionCount = pendingCount > 0 ? Math.min(pendingCount, plantCount) : 0;

    let summaryText;
    if (pendingCount > 0) {
      summaryText = `今天有 ${pendingCount} 项养护待办`;
    } else if (plantCount === 0) {
      summaryText = "还没有植物，去添加一盆吧 🌱";
    } else {
      summaryText = "";
    }

    this.setData({
      tasks,
      plantCount,
      pendingCount,
      attentionCount,
      weatherCurrent,
      forecastDays,
      summaryText,
    });

    wx.setNavigationBarTitle({
      title: pendingCount > 0 ? `首页（${pendingCount}）` : "首页",
    });
    setTodayTabBadgeFromCount(pendingCount);
  },

  /* ── data fetches ── */

  async loadTasks() {
    try {
      const raw = await request({ path: "/tasks/today", method: "GET" });
      const list = Array.isArray(raw) ? raw : [];
      return list.map((t) => ({
        id: t.id,
        plantNickname: t.plant?.nickname || "",
        displayTime: t.dueDate
          ? String(t.dueDate).slice(0, 16).replace("T", " ")
          : "",
        displayType:
          t.type === "water"
            ? "浇水"
            : t.type === "fertilize"
              ? "施肥"
              : t.type === "repot"
                ? "换盆"
                : t.type === "inspect"
                  ? "检查"
                  : String(t.type || ""),
        typeClass:
          t.type === "water"
            ? "water"
            : t.type === "fertilize"
              ? "fertilize"
              : "other",
      }));
    } catch {
      wx.showToast({ title: "任务加载失败", icon: "none" });
      return [];
    }
  },

  async loadPlants() {
    try {
      const raw = await request({ path: "/plants", method: "GET" });
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  },

  async loadWeather() {
    try {
      return await request({ path: "/weather/current", method: "GET" });
    } catch {
      return null;
    }
  },

  async loadForecast() {
    try {
      const raw = await request({ path: "/weather/forecast", method: "GET" });
      const days = Array.isArray(raw?.days) ? raw.days : [];
      const today = new Date();
      return days.map((d) => ({
        ...d,
        dow:
          d.date === this.dateStr(today)
            ? "今日"
            : WEEKDAYS[this.dayOfWeek(d.date)],
        wmoIcon: wmoIcon(d.weatherCode),
      }));
    } catch {
      return [];
    }
  },

  /* ── helpers ── */

  dateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  dayOfWeek(dateStr) {
    return new Date(dateStr + "T12:00:00").getDay();
  },

  /* ── actions ── */

  async onSubscribe() {
    wx.requestSubscribeMessage({
      tmplIds: [SUBSCRIBE_TEMPLATE_ID],
      success: async (res) => {
        try {
          await reportSubscribeFromWxResult(res);
          wx.showToast({ title: "已更新提醒额度" });
        } catch {
          wx.showToast({ title: "上报失败", icon: "none" });
        }
      },
    });
  },

  goAdd() {
    wx.navigateTo({ url: "/pages/plant-edit/plant-edit" });
  },

  goDiagnose() {
    wx.navigateTo({ url: "/pages/diagnose/diagnose" });
  },

  goPlants() {
    wx.switchTab({ url: "/pages/plants/plants" });
  },

  goIdentify() {
    wx.switchTab({ url: "/pages/identify/identify" });
  },

  /** 拍照识花 */
  onIdentify() {
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (pick) => {
        const path = pick.tempFiles[0].tempFilePath;
        const fs = wx.getFileSystemManager();
        fs.readFile({
          filePath: path,
          encoding: "base64",
          success: async (fileRes) => {
            wx.showLoading({ title: "识别中", mask: true });
            try {
              const data = await request({
                path: "/plants/identify",
                method: "POST",
                data: { imageBase64: fileRes.data },
              });
              const best = data && data.best;
              if (!best || !best.name) {
                wx.showToast({ title: "未识别到植物", icon: "none" });
                return;
              }
              wx.showToast({ title: "识别成功", icon: "success" });
            } catch (e) {
              const code = e && e.statusCode;
              if (code === 503) {
                wx.showToast({ title: "服务端未配置识别", icon: "none" });
              } else if (code === 422) {
                wx.showToast({ title: "未识别到植物", icon: "none" });
              } else {
                wx.showToast({ title: "识别失败", icon: "none" });
              }
            } finally {
              wx.hideLoading();
            }
          },
          fail: () => {
            wx.showToast({ title: "读取图片失败", icon: "none" });
          },
        });
      },
      fail: () => {
        wx.showToast({ title: "未选择图片", icon: "none" });
      },
    });
  },

  /** 土壤诊断 */
  onDiagnosePhoto() {
    wx.navigateTo({ url: "/pages/diagnose/diagnose?mode=soil" });
  },

  /** 症状诊断 */
  onDiagnoseSymptom() {
    wx.navigateTo({ url: "/pages/diagnose/diagnose" });
  },

  async onComplete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    try {
      await request({ path: `/tasks/${id}/complete`, method: "POST", data: {} });
      wx.showToast({ title: "已完成" });
      this.loadDashboard();
    } catch {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },

  async onSkip(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    try {
      await request({ path: `/tasks/${id}/skip`, method: "POST", data: {} });
      wx.showToast({ title: "已跳过" });
      this.loadDashboard();
    } catch {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },
});
