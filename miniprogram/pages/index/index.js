const {
  request,
  SUBSCRIBE_TEMPLATE_ID,
  reportSubscribeFromWxResult,
} = require("../../utils/api.js");

Page({
  data: { tasks: [] },
  onShow() {
    this.loadTasks();
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
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
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
  goDiscover() {
    wx.navigateTo({ url: "/pages/discover/discover" });
  },
  goPlants() {
    wx.navigateTo({ url: "/pages/plants/plants" });
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
