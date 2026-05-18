const {
  request,
  SUBSCRIBE_TEMPLATE_ID,
  reportSubscribeFromWxResult,
} = require("../../utils/api.js");
const { setTodayTabBadgeFromCount } = require("../../utils/tabBadge.js");

/** After user sees the location intro once (or already has coords), do not show again. */
const LOCATION_INTRO_MODAL_KEY = "greenai_location_intro_modal_done";

Page({
  data: { tasks: [] },
  async onShow() {
    await this.loadTasks();
    await this.maybePromptLocationOnce();
  },
  async loadTasks() {
    try {
      const raw = await request({ path: "/tasks/today", method: "GET" });
      const list = Array.isArray(raw) ? raw : [];
      const tasks = list.map((t) => ({
        ...t,
        plantNickname: t.plant && t.plant.nickname ? t.plant.nickname : "",
        displayDueDate: t.dueDate
          ? String(t.dueDate).slice(0, 16).replace("T", " ")
          : "",
        displayType: t.type === "water" ? "浇水" : t.type === "fertilize" ? "施肥" : String(t.type || ""),
      }));
      this.setData({ tasks });
      const n = tasks.length;
      if (n > 0) {
        wx.setNavigationBarTitle({ title: `今日任务（${n}）` });
      } else {
        wx.setNavigationBarTitle({ title: "今日任务" });
      }
      setTodayTabBadgeFromCount(n);
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },
  /** 首次进入首页且未保存经纬度时，引导去设置页（仅提示一次，本机存储）。 */
  async maybePromptLocationOnce() {
    try {
      if (wx.getStorageSync(LOCATION_INTRO_MODAL_KEY)) return;
      const me = await request({ path: "/users/me", method: "GET" });
      const hasLoc =
        me &&
        me.latitude != null &&
        me.longitude != null &&
        Number.isFinite(Number(me.latitude)) &&
        Number.isFinite(Number(me.longitude));
      if (hasLoc) {
        wx.setStorageSync(LOCATION_INTRO_MODAL_KEY, "1");
        return;
      }
      wx.showModal({
        title: "保存养护位置",
        content:
          "保存当前位置后，可结合当地天气与预报微调浇水提醒间隔。是否前往「设置」页开启定位并保存？",
        confirmText: "去设置",
        cancelText: "稍后",
        success: (res) => {
          wx.setStorageSync(LOCATION_INTRO_MODAL_KEY, "1");
          if (res.confirm) {
            wx.navigateTo({ url: "/pages/settings/settings" });
          }
        },
      });
    } catch (_) {
      /* 未登录或网络失败时不弹窗 */
    }
  },
  onRefresh() {
    this.loadTasks();
  },
  async onSubscribe() {
    wx.requestSubscribeMessage({
      tmplIds: [SUBSCRIBE_TEMPLATE_ID],
      success: async (res) => {
        try {
          await reportSubscribeFromWxResult(res);
          wx.showToast({ title: "已更新提醒额度" });
        } catch (_) {
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
  goSettings() {
    wx.navigateTo({ url: "/pages/settings/settings" });
  },
  async onComplete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    try {
      await request({ path: `/tasks/${id}/complete`, method: "POST" });
      wx.showToast({ title: "已完成" });
      this.loadTasks();
    } catch (err) {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },
  async onSkip(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    try {
      await request({ path: `/tasks/${id}/skip`, method: "POST", data: {} });
      wx.showToast({ title: "已跳过" });
      this.loadTasks();
    } catch (err) {
      wx.showToast({ title: "操作失败", icon: "none" });
    }
  },
});
