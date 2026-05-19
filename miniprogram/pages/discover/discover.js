const rawArticles = require("../../data/knowledge.js");
const { request } = require("../../utils/api.js");
const { refreshTodayTabBadge } = require("../../utils/tabBadge.js");

function decorateArticles(list) {
  return list.map((a) => {
    const title = String(a.title || "").trim();
    return {
      ...a,
      coverTone: typeof a.coverTone === "number" ? a.coverTone : 0,
      thumbGlyph: title ? title.charAt(0) : "植",
    };
  });
}

Page({
  data: { allArticles: [], articles: [], searchQuery: "" },
  onShow() {
    refreshTodayTabBadge();
  },
  onLoad() {
    const list = Array.isArray(rawArticles) ? rawArticles : [];
    const all = decorateArticles(list);
    this.setData({ allArticles: all, articles: all });
    this.tryMergeRemoteArticles();
  },
  async tryMergeRemoteArticles() {
    try {
      const remote = await request({ path: "/knowledge/articles", method: "GET" });
      if (!Array.isArray(remote) || remote.length === 0) return;
      const merged = new Map();
      for (const a of this.data.allArticles || []) {
        if (a && a.id != null) merged.set(String(a.id), a);
      }
      for (const a of remote) {
        if (a && a.id != null) merged.set(String(a.id), a);
      }
      const combined = decorateArticles([...merged.values()]);
      combined.sort((x, y) => String(x.title || "").localeCompare(String(y.title || ""), "zh"));
      this.setData({ allArticles: combined, articles: combined });
      const q = (this.data.searchQuery || "").trim().toLowerCase();
      this.applyFilter(q);
    } catch (_) {
      /* 未登录或接口不可用时保留本地数据 */
    }
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
