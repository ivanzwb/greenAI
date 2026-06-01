const { request } = require("../../utils/api.js");
const { refreshTodayTabBadge } = require("../../utils/tabBadge.js");

Page({
  data: {
    plants: [],
    displayPlants: [],
    searchQuery: "",
    needLocationTip: false,
  },

  onShow() {
    this.load();
    this.loadMeTip();
    refreshTodayTabBadge();
  },

  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value || "" });
    this.applyFilter();
  },

  applyFilter() {
    const plants = this.data.plants || [];
    const q = (this.data.searchQuery || "").trim().toLowerCase();
    let displayPlants = plants;
    if (q) {
      displayPlants = plants.filter((p) => {
        const nick = (p.nickname && String(p.nickname).toLowerCase()) || "";
        const sp = (p.speciesLabel && String(p.speciesLabel).toLowerCase()) || "";
        return nick.includes(q) || sp.includes(q);
      });
    }
    this.setData({ displayPlants });
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
      this.applyFilter();
    } catch (e) {
      wx.showToast({ title: "加载失败", icon: "none" });
    }
  },

  async loadMeTip() {
    try {
      const me = await request({ path: "/users/me", method: "GET" });
      const hasLoc = me.latitude != null && me.longitude != null;
      this.setData({
        needLocationTip: !hasLoc,
      });
    } catch {
      /* ignore */
    }
  },

  goAdd() {
    wx.navigateTo({ url: "/pages/plant-edit/plant-edit" });
  },

  goSettings() {
    wx.switchTab({ url: "/pages/settings/settings" });
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
