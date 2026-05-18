const articles = require("../../data/knowledge.json");

Page({
  data: { articles: [] },
  onLoad() {
    this.setData({ articles: Array.isArray(articles) ? articles : [] });
  },
  onOpen(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/discover-detail/discover-detail?id=${encodeURIComponent(id)}` });
  },
});
