const { request } = require("../../utils/api.js");
const { refreshTodayTabBadge } = require("../../utils/tabBadge.js");

Page({
  data: { plants: [] },
  onShow() {
    this.load();
    refreshTodayTabBadge();
  },
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
  goSettings() {
    wx.navigateTo({ url: "/pages/settings/settings" });
  },
  onRefresh() {
    this.load();
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
});
