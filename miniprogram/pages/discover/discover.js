const rawArticles = require("../../data/knowledge.json");

Page({
  data: { allArticles: [], articles: [], searchQuery: "" },
  onLoad() {
    const all = Array.isArray(rawArticles) ? rawArticles : [];
    this.setData({ allArticles: all, articles: all });
  },
  onSearchInput(e) {
    const q = (e.detail.value || "").trim().toLowerCase();
    this.setData({ searchQuery: e.detail.value || "" });
    this.applyFilter(q);
  },
  applyFilter(q) {
    const all = this.data.allArticles || [];
    if (!q) {
      this.setData({ articles: all });
      return;
    }
    const filtered = all.filter((a) => {
      const hay = `${a.title || ""} ${a.summary || ""} ${a.body || ""}`.toLowerCase();
      return hay.includes(q);
    });
    this.setData({ articles: filtered });
  },
  onOpen(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/discover-detail/discover-detail?id=${encodeURIComponent(id)}` });
  },
});
